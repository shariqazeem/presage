// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {PresageAgents} from "./PresageAgents.sol";
import {PresageCalls} from "./PresageCalls.sol";

/// @title PresageMarket
/// @notice Payments for Presage agents: monthly subscriptions and single paid calls, in native METIS
/// or an accepted stablecoin. Each payment is split on the spot, 80% to the agent's creator and 20% to
/// the platform, and each party claims its own share. An agent can only take subscribers once its
/// record holds at least 10 resolved calls spanning 7 days, and that rule cannot be changed.
contract PresageMarket is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    address public constant NATIVE = address(0);
    uint16 public constant CREATOR_BPS = 8_000;
    uint40 public constant PERIOD = 30 days;
    uint8 public constant MAX_PERIODS = 12;
    uint32 public constant MIN_RESOLVED_CALLS = 10;
    uint40 public constant MIN_RECORD_AGE = 7 days;
    uint40 public constant MAX_RATE_AGE = 3 days;

    PresageAgents public immutable agents;
    PresageCalls public immutable calls;

    address public treasury;
    address public rateKeeper;
    /// USD price of 1 METIS with 8 decimals, kept current by the rate keeper.
    uint256 public usdPerMetisE8;
    uint40 public rateUpdatedAt;

    /// Accepted stablecoins and their decimals. 0 means not accepted.
    mapping(address token => uint8) public stableDecimals;
    mapping(uint256 agentId => mapping(address subscriber => uint40)) public subscribedUntil;
    mapping(bytes32 requestId => address payer) public callPayer;
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
    event Earned(address indexed account, address indexed token, uint256 amount);
    event Claimed(address indexed account, address indexed token, uint256 amount);
    event RateSet(uint256 usdPerMetisE8);
    event StableSet(address indexed token, uint8 decimals);
    event TreasurySet(address indexed treasury);
    event RateKeeperSet(address indexed keeper);

    error AgentNotActive(uint256 agentId);
    error NotForSale(uint256 agentId);
    error RecordTooShort(uint256 agentId, uint256 resolved, uint256 sinceFirstCall);
    error BadPeriods();
    error TokenNotAccepted(address token);
    error RateStale();
    error AboveMaxAmount(uint256 amount, uint256 maxAmount);
    error ValueMismatch();
    error AlreadyPaid(bytes32 requestId);
    error NothingToClaim();
    error NotRateKeeper();
    error ZeroAddress();
    error BadRate();
    error NativeTransferFailed();

    constructor(
        address initialOwner,
        PresageAgents agents_,
        PresageCalls calls_,
        address treasury_,
        address rateKeeper_
    ) Ownable(initialOwner) {
        if (treasury_ == address(0)) revert ZeroAddress();
        agents = agents_;
        calls = calls_;
        treasury = treasury_;
        rateKeeper = rateKeeper_;
        emit TreasurySet(treasury_);
        emit RateKeeperSet(rateKeeper_);
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

    function setRateKeeper(address keeper) external onlyOwner {
        rateKeeper = keeper;
        emit RateKeeperSet(keeper);
    }

    function setMetisRate(uint256 usdPerMetisE8_) external {
        if (msg.sender != rateKeeper && msg.sender != owner()) revert NotRateKeeper();
        if (usdPerMetisE8_ == 0) revert BadRate();
        usdPerMetisE8 = usdPerMetisE8_;
        rateUpdatedAt = uint40(block.timestamp);
        emit RateSet(usdPerMetisE8_);
    }

    // ---------------------------------------------------------------- views

    /// @notice Amount of `token` (NATIVE for METIS) that pays `usd6` dollars, rounded up.
    function quote(uint256 usd6, address token) public view returns (uint256) {
        if (token == NATIVE) {
            if (usdPerMetisE8 == 0 || block.timestamp > uint256(rateUpdatedAt) + MAX_RATE_AGE) revert RateStale();
            // usd6 * 1e18 (wei) * 1e8 (rate scale) / (1e6 (usd scale) * usdPerMetisE8)
            return _ceilDiv(usd6 * 1e20, usdPerMetisE8);
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

    // ---------------------------------------------------------------- payments

    /// @notice Subscribe to an agent for `periods` x 30 days. `maxAmount` protects against a price
    /// change landing before this transaction; for METIS the value sent is the cap and any excess
    /// is refunded.
    function subscribe(uint256 agentId, address token, uint8 periods, uint256 maxAmount)
        external
        payable
        nonReentrant
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

    /// @notice Pay for one call. `requestId` is issued by the agent's server for the request being
    /// paid and can only be paid once.
    function payForCall(uint256 agentId, bytes32 requestId, address token, uint256 maxAmount)
        external
        payable
        nonReentrant
    {
        if (callPayer[requestId] != address(0)) revert AlreadyPaid(requestId);
        PresageAgents.Agent memory a = agents.getAgent(agentId);
        if (a.retired) revert AgentNotActive(agentId);
        if (a.callPriceUsd6 == 0) revert NotForSale(agentId);

        uint256 amount = quote(a.callPriceUsd6, token);
        callPayer[requestId] = msg.sender;
        _collect(token, amount, maxAmount);
        _split(a.creator, token, amount);

        emit CallPaid(requestId, agentId, msg.sender, token, amount);
    }

    /// @notice Withdraw everything you have earned in `token` (NATIVE for METIS).
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
        if (token == NATIVE) {
            if (msg.value < amount) revert ValueMismatch();
            if (amount > maxAmount) revert AboveMaxAmount(amount, maxAmount);
            uint256 excess = msg.value - amount;
            if (excess != 0) _sendNative(msg.sender, excess);
        } else {
            if (msg.value != 0) revert ValueMismatch();
            if (amount > maxAmount) revert AboveMaxAmount(amount, maxAmount);
            IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        }
    }

    function _split(address creator, address token, uint256 amount) private {
        uint256 toCreator = (amount * CREATOR_BPS) / 10_000;
        uint256 toPlatform = amount - toCreator;
        earnings[creator][token] += toCreator;
        earnings[treasury][token] += toPlatform;
        emit Earned(creator, token, toCreator);
        emit Earned(treasury, token, toPlatform);
    }

    function _sendNative(address to, uint256 amount) private {
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert NativeTransferFailed();
    }

    function _ceilDiv(uint256 a, uint256 b) private pure returns (uint256) {
        return a == 0 ? 0 : (a - 1) / b + 1;
    }
}
