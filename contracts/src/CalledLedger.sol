// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";

interface ICalledAgents {
    function isActive(uint256 agentId) external view returns (bool);
}

/// @title CalledLedger
/// @notice Every call an agent makes is sealed here before its outcome and revealed after it.
/// A call is sealed as a hash of (salt, payload). Nobody can read it until it is revealed, and
/// nobody can change it: the reveal must hash to the sealed commitment. A call that is not
/// revealed by its deadline can be marked forfeited by anyone, and a forfeit counts against the
/// agent. Nothing is ever edited or deleted.
contract CalledLedger is Ownable2Step {
    enum Status {
        None,
        Sealed,
        Revealed,
        Forfeited
    }

    /// Win: the call worked. Loss: it failed. Flat: it closed at the horizon with no clear result.
    /// NoFill: a setup whose entry was never reached, so no position would have existed.
    enum Outcome {
        None,
        Win,
        Loss,
        Flat,
        NoFill
    }

    struct Call {
        uint64 agentId;
        uint40 sealedAt;
        uint40 revealBy;
        Status status;
        Outcome outcome;
        // Signed result. Units follow the agent's kind: basis points of price return in the
        // called direction for direction agents, hundredths of R for setup agents.
        int32 result;
        bytes32 commitment;
    }

    struct Record {
        uint32 total;
        uint32 revealed;
        uint32 wins;
        uint32 losses;
        uint32 flats;
        uint32 noFills;
        uint32 forfeited;
        int64 resultSum;
        uint40 firstSealedAt;
        uint40 lastSealedAt;
    }

    uint40 public constant MIN_REVEAL_WINDOW = 5 minutes;
    uint40 public constant MAX_REVEAL_WINDOW = 30 days;

    ICalledAgents public immutable agents;

    uint256 public callCount;
    mapping(uint256 callId => Call) private _calls;
    mapping(uint256 agentId => Record) private _records;
    mapping(address account => bool) public isCommitter;

    event CallSealed(uint256 indexed callId, uint256 indexed agentId, bytes32 commitment, uint40 revealBy);
    event CallRevealed(
        uint256 indexed callId, uint256 indexed agentId, Outcome outcome, int32 result, bytes32 salt, bytes payload
    );
    event CallForfeited(uint256 indexed callId, uint256 indexed agentId, address indexed by);
    event CommitterSet(address indexed account, bool allowed);

    error NotCommitter();
    error AgentNotActive(uint256 agentId);
    error BadRevealWindow();
    error NotSealed(uint256 callId);
    error RevealDeadlinePassed(uint256 callId);
    error RevealDeadlineNotPassed(uint256 callId);
    error CommitmentMismatch(uint256 callId);
    error NoOutcome();
    error EmptyCommitment();

    modifier onlyCommitter() {
        if (!isCommitter[msg.sender]) revert NotCommitter();
        _;
    }

    constructor(address initialOwner, ICalledAgents agents_) Ownable(initialOwner) {
        agents = agents_;
    }

    function setCommitter(address account, bool allowed) external onlyOwner {
        isCommitter[account] = allowed;
        emit CommitterSet(account, allowed);
    }

    /// @notice Seal a call before its outcome. `commitment` is keccak256(abi.encodePacked(salt, payload)).
    function seal(uint256 agentId, bytes32 commitment, uint40 revealBy)
        external
        onlyCommitter
        returns (uint256 callId)
    {
        if (commitment == bytes32(0)) revert EmptyCommitment();
        if (agentId > type(uint64).max || !agents.isActive(agentId)) revert AgentNotActive(agentId);
        uint40 now_ = uint40(block.timestamp);
        if (revealBy < now_ + MIN_REVEAL_WINDOW || revealBy > now_ + MAX_REVEAL_WINDOW) revert BadRevealWindow();

        callId = ++callCount;
        _calls[callId] = Call({
            agentId: uint64(agentId),
            sealedAt: now_,
            revealBy: revealBy,
            status: Status.Sealed,
            outcome: Outcome.None,
            result: 0,
            commitment: commitment
        });

        Record storage r = _records[agentId];
        r.total += 1;
        if (r.firstSealedAt == 0) r.firstSealedAt = now_;
        r.lastSealedAt = now_;

        emit CallSealed(callId, agentId, commitment, revealBy);
    }

    /// @notice Reveal a sealed call with its outcome. The payload is published in the event so anyone
    /// can read the call and check the outcome against public price data.
    function reveal(uint256 callId, bytes32 salt, bytes calldata payload, Outcome outcome, int32 result)
        external
        onlyCommitter
    {
        Call storage c = _calls[callId];
        if (c.status != Status.Sealed) revert NotSealed(callId);
        if (block.timestamp > c.revealBy) revert RevealDeadlinePassed(callId);
        if (keccak256(abi.encodePacked(salt, payload)) != c.commitment) revert CommitmentMismatch(callId);
        if (outcome == Outcome.None) revert NoOutcome();

        c.status = Status.Revealed;
        c.outcome = outcome;
        c.result = result;

        Record storage r = _records[c.agentId];
        r.revealed += 1;
        if (outcome == Outcome.Win) r.wins += 1;
        else if (outcome == Outcome.Loss) r.losses += 1;
        else if (outcome == Outcome.Flat) r.flats += 1;
        else r.noFills += 1;
        r.resultSum += result;

        emit CallRevealed(callId, c.agentId, outcome, result, salt, payload);
    }

    /// @notice Anyone can forfeit a call whose reveal deadline has passed. A forfeit counts against
    /// the agent forever, so hiding a losing call costs as much as showing it.
    function forfeit(uint256 callId) external {
        Call storage c = _calls[callId];
        if (c.status != Status.Sealed) revert NotSealed(callId);
        if (block.timestamp <= c.revealBy) revert RevealDeadlineNotPassed(callId);

        c.status = Status.Forfeited;
        _records[c.agentId].forfeited += 1;

        emit CallForfeited(callId, c.agentId, msg.sender);
    }

    function getCall(uint256 callId) external view returns (Call memory) {
        return _calls[callId];
    }

    function recordOf(uint256 agentId) external view returns (Record memory) {
        return _records[agentId];
    }

    /// @notice Calls that count toward an agent's record: revealed or forfeited.
    function resolvedCount(uint256 agentId) external view returns (uint256) {
        Record storage r = _records[agentId];
        return uint256(r.revealed) + uint256(r.forfeited);
    }
}
