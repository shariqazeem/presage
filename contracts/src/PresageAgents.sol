// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

interface IERC8004Identity {
    function ownerOf(uint256 agentId) external view returns (address);
}

/// @title PresageAgents
/// @notice The roster of Presage agents. Each agent is an ERC-8004 identity whose owner registered a
/// strategy spec here. The spec is sealed by its hash and can never change; a different spec has to be
/// registered as a new agent, so a record always belongs to exactly one strategy. Agents can be
/// retired but never deleted, so every agent a creator ever launched stays on their public profile.
contract PresageAgents {
    /// Direction: answers "which way, over what horizon" (the Oracle).
    /// Setup: publishes trade setups with entry, stop and target (ST Quant and creator agents).
    enum Kind {
        None,
        Direction,
        Setup
    }

    struct Agent {
        address creator;
        uint40 registeredAt;
        Kind kind;
        bool retired;
        // Subscription price per 30 days in USD with 6 decimals. 0 means not for subscription.
        uint64 priceUsd6;
        // Price of a single paid call in USD with 6 decimals. 0 means no pay-per-call.
        uint64 callPriceUsd6;
        bytes32 specHash;
    }

    uint64 public constant MIN_PRICE_USD6 = 2_000_000; // $2 per 30 days
    uint64 public constant MAX_PRICE_USD6 = 500_000_000; // $500 per 30 days
    uint64 public constant MIN_CALL_PRICE_USD6 = 10_000; // $0.01 per call
    uint64 public constant MAX_CALL_PRICE_USD6 = 10_000_000; // $10 per call

    IERC8004Identity public immutable identity;

    uint256 public agentCount;
    uint256[] private _agentIds;
    mapping(uint256 agentId => Agent) private _agents;
    mapping(address creator => uint256[]) private _byCreator;

    event AgentRegistered(
        uint256 indexed agentId, address indexed creator, Kind kind, bytes32 specHash, string specURI
    );
    event PriceSet(uint256 indexed agentId, uint64 priceUsd6, uint64 callPriceUsd6);
    event AgentRetired(uint256 indexed agentId);

    error NotIdentityOwner(uint256 agentId);
    error AlreadyRegistered(uint256 agentId);
    error UnknownAgent(uint256 agentId);
    error NotCreator(uint256 agentId);
    error AlreadyRetired(uint256 agentId);
    error BadKind();
    error EmptySpec();
    error PriceOutOfRange();

    constructor(IERC8004Identity identity_) {
        identity = identity_;
    }

    /// @notice Register the strategy behind an ERC-8004 identity you own. `agentId` is the identity's id.
    function register(
        uint256 agentId,
        Kind kind,
        bytes32 specHash,
        string calldata specURI,
        uint64 priceUsd6,
        uint64 callPriceUsd6
    ) external {
        if (_agents[agentId].creator != address(0)) revert AlreadyRegistered(agentId);
        if (identity.ownerOf(agentId) != msg.sender) revert NotIdentityOwner(agentId);
        if (kind == Kind.None) revert BadKind();
        if (specHash == bytes32(0)) revert EmptySpec();
        _checkPrices(priceUsd6, callPriceUsd6);

        _agents[agentId] = Agent({
            creator: msg.sender,
            registeredAt: uint40(block.timestamp),
            kind: kind,
            retired: false,
            priceUsd6: priceUsd6,
            callPriceUsd6: callPriceUsd6,
            specHash: specHash
        });
        _agentIds.push(agentId);
        _byCreator[msg.sender].push(agentId);
        agentCount += 1;

        emit AgentRegistered(agentId, msg.sender, kind, specHash, specURI);
        emit PriceSet(agentId, priceUsd6, callPriceUsd6);
    }

    /// @notice Creators may change prices at any time. The spec can never change.
    function setPrices(uint256 agentId, uint64 priceUsd6, uint64 callPriceUsd6) external {
        Agent storage a = _ownAgent(agentId);
        _checkPrices(priceUsd6, callPriceUsd6);
        a.priceUsd6 = priceUsd6;
        a.callPriceUsd6 = callPriceUsd6;
        emit PriceSet(agentId, priceUsd6, callPriceUsd6);
    }

    /// @notice Stop an agent for good. It makes no new calls and takes no new subscribers, but its
    /// record stays public forever.
    function retire(uint256 agentId) external {
        Agent storage a = _ownAgent(agentId);
        if (a.retired) revert AlreadyRetired(agentId);
        a.retired = true;
        emit AgentRetired(agentId);
    }

    function isActive(uint256 agentId) external view returns (bool) {
        Agent storage a = _agents[agentId];
        return a.creator != address(0) && !a.retired;
    }

    function getAgent(uint256 agentId) external view returns (Agent memory) {
        Agent memory a = _agents[agentId];
        if (a.creator == address(0)) revert UnknownAgent(agentId);
        return a;
    }

    function agentIds() external view returns (uint256[] memory) {
        return _agentIds;
    }

    function agentsOf(address creator) external view returns (uint256[] memory) {
        return _byCreator[creator];
    }

    function _ownAgent(uint256 agentId) private view returns (Agent storage a) {
        a = _agents[agentId];
        if (a.creator == address(0)) revert UnknownAgent(agentId);
        if (a.creator != msg.sender) revert NotCreator(agentId);
    }

    function _checkPrices(uint64 priceUsd6, uint64 callPriceUsd6) private pure {
        if (priceUsd6 != 0 && (priceUsd6 < MIN_PRICE_USD6 || priceUsd6 > MAX_PRICE_USD6)) revert PriceOutOfRange();
        if (callPriceUsd6 != 0 && (callPriceUsd6 < MIN_CALL_PRICE_USD6 || callPriceUsd6 > MAX_CALL_PRICE_USD6)) {
            revert PriceOutOfRange();
        }
    }
}
