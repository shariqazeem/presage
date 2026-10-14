// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {PresageAgents} from "./PresageAgents.sol";
import {PresageCalls} from "./PresageCalls.sol";

interface AggregatorV3Interface {
    function decimals() external view returns (uint8);
    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);
}

/// @title PresageMarket
/// @notice Payments for Presage agents, in native METIS (priced by Chainlink) or an accepted stablecoin.
///
/// Subscriptions: 30-day periods, split on the spot 80% to the agent's creator and 20% to the platform.
/// An agent can only take subscribers once its record holds at least 10 resolved calls spanning 7 days.
///
/// Paid calls are escrowed. The payment is locked when the caller pays, the call is sealed on chain
/// against that payment, and the money is released only once the call is revealed. If the call is not
/// sealed within 15 minutes, or is never revealed and gets forfeited, the payer gets the money back.
///
/// Every account withdraws its own balance with claim(). None of these rules can be changed.
contract PresageMarket is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum RequestState {
        None,
        Paid,
        Sealed,
        Settled,
        Refunded
    }

    struct PaidRequest {
        address payer;
        uint40 paidAt;
        RequestState state;
        uint64 agentId;
        address token;
        uint256 amount;
        uint256 callId;
    }

    address public constant NATIVE = address(0);
    uint16 public constant CREATOR_BPS = 8_000;
    uint40 public constant PERIOD = 30 days;
    uint8 public constant MAX_PERIODS = 12;
    uint32 public constant MIN_RESOLVED_CALLS = 10;
    uint40 public constant MIN_RECORD_AGE = 7 days;
    uint40 public constant DELIVERY_WINDOW = 15 minutes;
    uint40 public constant SEQUENCER_GRACE = 1 hours;

    PresageAgents public immutable agents;
    PresageCalls public immutable calls;
    /// Chainlink METIS/USD.
    AggregatorV3Interface public immutable metisUsdFeed;
    /// Chainlink L2 sequencer uptime feed, or address(0) where there is none.
    AggregatorV3Interface public immutable sequencerFeed;
    uint256 public immutable maxPriceAge;
    uint8 private immutable _feedDecimals;

    address public treasury;
    /// Stops new subscriptions and paid calls. Claims, refunds and settlement always keep working.
    bool public paymentsPaused;

    /// Accepted stablecoins and their decimals. 0 means not accepted.
    mapping(address token => uint8) public stableDecimals;
    mapping(address account => bool) public isOperator;
    mapping(uint256 agentId => mapping(address subscriber => uint40)) public subscribedUntil;
    mapping(bytes32 requestId => PaidRequest) private _requests;
    mapping(address account => mapping(address token => uint256)) public earnings;

    event Subscribed(
        uint256 indexed agentId,
        address indexed subscriber,
        address indexed token,
        uint256 amount,
        uint8 periods,
        uint40 until
    );
    event CallPaid(
        bytes32 indexed requestId, uint256 indexed agentId, address indexed payer, address token, uint256 amount
    );
    event CallDelivered(bytes32 indexed requestId, uint256 indexed callId);
    event CallSettled(bytes32 indexed requestId, uint256 indexed callId);
    event CallRefunded(bytes32 indexed requestId, address indexed payer, bool forfeited);
    event Earned(address indexed account, address indexed token, uint256 amount);
    event Claimed(address indexed account, address indexed token, uint256 amount);
    event StableSet(address indexed token, uint8 decimals);
    event TreasurySet(address indexed treasury);
    event OperatorSet(address indexed account, bool allowed);
    event PaymentsPaused(bool paused);

    error AgentNotActive(uint256 agentId);
    error NotForSale(uint256 agentId);
    error RecordTooShort(uint256 agentId, uint256 resolved, uint256 sinceFirstCall);
    error BadPeriods();
    error TokenNotAccepted(address token);
    error PriceUnavailable();
    error AboveMaxAmount(uint256 amount, uint256 maxAmount);
    error ValueMismatch();
    error BadRequest(bytes32 requestId);
    error AlreadyPaid(bytes32 requestId);
    error DeliveryWindowClosed(bytes32 requestId);
    error DeliveryWindowOpen(bytes32 requestId);
    error NotResolved(bytes32 requestId);
    error NothingToClaim();
    error NotOperator();
    error ZeroAddress();
    error NativeTransferFailed();
    error Paused();

    modifier whenPaymentsOpen() {
        if (paymentsPaused) revert Paused();
        _;
    }

    modifier onlyOperator() {
        if (!isOperator[msg.sender]) revert NotOperator();
        _;
    }

    constructor(
        address initialOwner,
        PresageAgents agents_,
        PresageCalls calls_,
        AggregatorV3Interface metisUsdFeed_,
        AggregatorV3Interface sequencerFeed_,
        uint256 maxPriceAge_,
        address treasury_
    ) Ownable(initialOwner) {
        if (treasury_ == address(0) || address(metisUsdFeed_) == address(0)) revert ZeroAddress();
        agents = agents_;
        calls = calls_;
        metisUsdFeed = metisUsdFeed_;
        sequencerFeed = sequencerFeed_;
        maxPriceAge = maxPriceAge_;
        _feedDecimals = metisUsdFeed_.decimals();
        treasury = treasury_;
        emit TreasurySet(treasury_);
    }

    // ---------------------------------------------------------------- admin

    function setStable(address token, uint8 decimals) external onlyOwner {
        if (token == address(0)) revert ZeroAddress();
        stableDecimals[token] = decimals;
        emit StableSet(token, decimals);
    }

    function setTreasury(address treasury_) external onlyOwner {
        if (treasury_ == address(0)) revert ZeroAddress();
        treasury = treasury_;
        emit TreasurySet(treasury_);
    }

    function setOperator(address account, bool allowed) external onlyOwner {
        isOperator[account] = allowed;
        emit OperatorSet(account, allowed);
    }

    function setPaymentsPaused(bool paused) external onlyOwner {
        paymentsPaused = paused;
        emit PaymentsPaused(paused);
    }

    // ---------------------------------------------------------------- views

    /// @notice USD price of one METIS with 8 decimals, from Chainlink. Reverts if the feed is stale or
    /// the sequencer is down or only just back.
    function metisUsdE8() public view returns (uint256) {
        if (address(sequencerFeed) != address(0)) {
            (, int256 status, uint256 startedAt,,) = sequencerFeed.latestRoundData();
            if (status != 0 || block.timestamp - startedAt <= SEQUENCER_GRACE) revert PriceUnavailable();
        }
        (, int256 answer,, uint256 updatedAt,) = metisUsdFeed.latestRoundData();
        if (answer <= 0 || updatedAt == 0 || block.timestamp - updatedAt > maxPriceAge) revert PriceUnavailable();
        uint256 price = uint256(answer);
        if (_feedDecimals > 8) return price / 10 ** (_feedDecimals - 8);
        return price * 10 ** (8 - _feedDecimals);
    }

    /// @notice Amount of `token` (NATIVE for METIS) that pays `usd6` dollars, rounded up.
    function quote(uint256 usd6, address token) public view returns (uint256) {
        if (token == NATIVE) {
            // usd6 * 1e18 (wei) * 1e8 (price scale) / (1e6 (usd scale) * price)
            return _ceilDiv(usd6 * 1e20, metisUsdE8());
        }
        uint8 dec = stableDecimals[token];
        if (dec == 0) revert TokenNotAccepted(token);
        if (dec >= 6) return usd6 * 10 ** (dec - 6);
        return _ceilDiv(usd6, 10 ** (6 - dec));
    }

    function subscriptionQuote(uint256 agentId, address token, uint8 periods) external view returns (uint256) {
        return quote(uint256(agents.getAgent(agentId).priceUsd6) * periods, token);
    }

    function callQuote(uint256 agentId, address token) external view returns (uint256) {
        return quote(agents.getAgent(agentId).callPriceUsd6, token);
    }

    /// @notice Whether an agent's record is long enough to take subscribers.
    function recordReady(uint256 agentId) public view returns (bool ready, uint256 resolved, uint256 sinceFirstCall) {
        PresageCalls.Record memory r = calls.recordOf(agentId);
        resolved = uint256(r.revealed) + uint256(r.forfeited);
        sinceFirstCall = r.firstSealedAt == 0 ? 0 : block.timestamp - r.firstSealedAt;
        ready = resolved >= MIN_RESOLVED_CALLS && r.firstSealedAt != 0 && sinceFirstCall >= MIN_RECORD_AGE;
    }

    function isSubscribed(uint256 agentId, address account) external view returns (bool) {
        return subscribedUntil[agentId][account] > block.timestamp;
    }

    function getRequest(bytes32 requestId) external view returns (PaidRequest memory) {
        return _requests[requestId];
    }

    // ---------------------------------------------------------------- subscriptions

    /// @notice Subscribe to an agent for `periods` x 30 days. `maxAmount` protects against a price
    /// change landing first; for METIS any value sent above the price is refunded.
    function subscribe(uint256 agentId, address token, uint8 periods, uint256 maxAmount)
        external
        payable
        nonReentrant
        whenPaymentsOpen
        returns (uint40 until)
    {
        if (periods == 0 || periods > MAX_PERIODS) revert BadPeriods();
        PresageAgents.Agent memory a = agents.getAgent(agentId);
        if (a.retired) revert AgentNotActive(agentId);
        if (a.priceUsd6 == 0) revert NotForSale(agentId);
        (bool ready, uint256 resolved, uint256 since) = recordReady(agentId);
        if (!ready) revert RecordTooShort(agentId, resolved, since);

        uint256 amount = quote(uint256(a.priceUsd6) * periods, token);
        _collect(token, amount, maxAmount);
        _split(a.creator, token, amount);

        uint40 from = subscribedUntil[agentId][msg.sender];
        if (from < block.timestamp) from = uint40(block.timestamp);
        until = from + PERIOD * periods;
        subscribedUntil[agentId][msg.sender] = until;

        emit Subscribed(agentId, msg.sender, token, amount, periods, until);
    }

    // ---------------------------------------------------------------- paid calls (escrow)

    /// @notice Pay for one call. The payment is held in escrow until the call is revealed.
    /// `requestId` is issued by the agent's server for the request being paid and is paid once.
    function payForCall(uint256 agentId, bytes32 requestId, address token, uint256 maxAmount)
        external
        payable
        nonReentrant
        whenPaymentsOpen
    {
        if (requestId == bytes32(0) || agentId > type(uint64).max) revert BadRequest(requestId);
        if (_requests[requestId].state != RequestState.None) revert AlreadyPaid(requestId);
        PresageAgents.Agent memory a = agents.getAgent(agentId);
        if (a.retired) revert AgentNotActive(agentId);
        if (a.callPriceUsd6 == 0) revert NotForSale(agentId);

        uint256 amount = quote(a.callPriceUsd6, token);
        _requests[requestId] = PaidRequest({
            payer: msg.sender,
            paidAt: uint40(block.timestamp),
            state: RequestState.Paid,
            agentId: uint64(agentId),
            token: token,
            amount: amount,
            callId: 0
        });
        _collect(token, amount, maxAmount);

        emit CallPaid(requestId, agentId, msg.sender, token, amount);
    }

    /// @notice Seal the call that answers a paid request. Must land within the delivery window.
    function sealPaidCall(bytes32 requestId, bytes32 commitment, uint40 revealBy)
        external
        onlyOperator
        returns (uint256 callId)
    {
        PaidRequest storage r = _requests[requestId];
        if (r.state != RequestState.Paid) revert BadRequest(requestId);
        if (block.timestamp > uint256(r.paidAt) + DELIVERY_WINDOW) revert DeliveryWindowClosed(requestId);

        callId = calls.seal(r.agentId, commitment, revealBy);
        r.callId = callId;
        r.state = RequestState.Sealed;
        emit CallDelivered(requestId, callId);
    }

    /// @notice Release or refund a paid call once its outcome is final. Anyone can call this.
    /// Revealed: the payment is split between creator and platform. Forfeited: the payer is refunded.
    function settle(bytes32 requestId) public nonReentrant {
        PaidRequest storage r = _requests[requestId];
        if (r.state != RequestState.Sealed) revert BadRequest(requestId);
        PresageCalls.Status status = calls.getCall(r.callId).status;

        if (status == PresageCalls.Status.Revealed) {
            r.state = RequestState.Settled;
            _split(agents.getAgent(r.agentId).creator, r.token, r.amount);
            emit CallSettled(requestId, r.callId);
        } else if (status == PresageCalls.Status.Forfeited) {
            r.state = RequestState.Refunded;
            _credit(r.payer, r.token, r.amount);
            emit CallRefunded(requestId, r.payer, true);
        } else {
            revert NotResolved(requestId);
        }
    }

    function settleMany(bytes32[] calldata requestIds) external {
        for (uint256 i; i < requestIds.length; i++) {
            settle(requestIds[i]);
        }
    }

    /// @notice Refund a paid request whose call was never sealed in time. Anyone can call this.
    function refundUndelivered(bytes32 requestId) external nonReentrant {
        PaidRequest storage r = _requests[requestId];
        if (r.state != RequestState.Paid) revert BadRequest(requestId);
        if (block.timestamp <= uint256(r.paidAt) + DELIVERY_WINDOW) revert DeliveryWindowOpen(requestId);
        r.state = RequestState.Refunded;
        _credit(r.payer, r.token, r.amount);
        emit CallRefunded(requestId, r.payer, false);
    }

    // ---------------------------------------------------------------- withdrawals

    /// @notice Withdraw everything you are owed in `token` (NATIVE for METIS): earnings or refunds.
    function claim(address token) external nonReentrant returns (uint256 amount) {
        amount = earnings[msg.sender][token];
        if (amount == 0) revert NothingToClaim();
        earnings[msg.sender][token] = 0;
        if (token == NATIVE) {
            _sendNative(msg.sender, amount);
        } else {
            IERC20(token).safeTransfer(msg.sender, amount);
        }
        emit Claimed(msg.sender, token, amount);
    }

    // ---------------------------------------------------------------- internals

    function _collect(address token, uint256 amount, uint256 maxAmount) private {
        if (amount > maxAmount) revert AboveMaxAmount(amount, maxAmount);
        if (token == NATIVE) {
            if (msg.value < amount) revert ValueMismatch();
            uint256 excess = msg.value - amount;
            if (excess != 0) _sendNative(msg.sender, excess);
        } else {
            if (msg.value != 0) revert ValueMismatch();
            IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        }
    }

    function _split(address creator, address token, uint256 amount) private {
        uint256 toCreator = (amount * CREATOR_BPS) / 10_000;
        _credit(creator, token, toCreator);
        _credit(treasury, token, amount - toCreator);
    }

    function _credit(address account, address token, uint256 amount) private {
        earnings[account][token] += amount;
        emit Earned(account, token, amount);
    }

    function _sendNative(address to, uint256 amount) private {
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert NativeTransferFailed();
    }

    function _ceilDiv(uint256 a, uint256 b) private pure returns (uint256) {
        return a == 0 ? 0 : (a - 1) / b + 1;
    }
}
