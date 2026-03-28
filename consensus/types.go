package consensus

import (
	"fmt"
)

// Address represents a system UTXO address registered for treasury operations.
type Address string

// BCIAmount represents an amount of the BCI native token measured in satoshi-like units.
type BCIAmount uint64

func (a BCIAmount) String() string {
	return fmt.Sprintf("%dBCI", uint64(a))
}

// CoinbaseMetadata captures provenance information for newly minted inflows.
type CoinbaseMetadata struct {
	BlockHeight uint64
	Producer    string
	Reference   string
	Memo        string
	Extra       map[string]string
}

// SpendRequest models an authorized spend proposal awaiting rule evaluation.
type SpendRequest struct {
	ID       string
	To       Address
	Amount   BCIAmount
	Priority int
	Memo     string
	Metadata map[string]string
}

// TransferInstruction describes an outbound transfer derived from rule evaluation.
type TransferInstruction struct {
	RequestID string
	To        Address
	Amount    BCIAmount
	Memo      string
	RuleID    string
}

// TreasuryState is a snapshot of treasury conditions exposed to planners.
type TreasuryState struct {
	SystemAddress Address
	Balance       BCIAmount
	Pending       []SpendRequest
}

// OutflowExecution captures the result of executing an outbound treasury transfer.
type OutflowExecution struct {
	TxID          string
	Instructions  []TransferInstruction
	TotalAmount   BCIAmount
	RuleIDs       []string
	RequestIDs    []string
	SystemAddress Address
}
