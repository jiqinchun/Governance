package rpc

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"strconv"
	"sync"
	"time"

	"treasury/consensus"
)

// TreasuryRPCServer 国库RPC服务器
type TreasuryRPCServer struct {
	config   *ServerConfig
	treasury *consensus.Treasury
	store    TransactionStore
	server   *http.Server
	mu       sync.RWMutex
	running  bool
}

// NewTreasuryRPCServer 创建国库RPC服务器
func NewTreasuryRPCServer(treasury *consensus.Treasury, config *ServerConfig, store TransactionStore) *TreasuryRPCServer {
	if config == nil {
		config = DefaultServerConfig()
	}
	if store == nil {
		store = NewInMemoryTransactionStore()
	}
	return &TreasuryRPCServer{
		config:   config,
		treasury: treasury,
		store:    store,
	}
}

// Start 启动RPC服务器
func (s *TreasuryRPCServer) Start() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.running {
		return fmt.Errorf("server already running")
	}

	addr := net.JoinHostPort(s.config.Host, strconv.Itoa(s.config.Port))

	mux := http.NewServeMux()
	s.registerHandlers(mux)

	s.server = &http.Server{
		Addr:         addr,
		Handler:      mux,
		ReadTimeout:  s.config.ReadTimeout,
		WriteTimeout: s.config.WriteTimeout,
	}

	listener, err := net.Listen("tcp", addr)
	if err != nil {
		return fmt.Errorf("failed to listen on %s: %w", addr, err)
	}

	s.running = true

	go func() {
		var err error
		if s.config.EnableTLS {
			err = s.server.ServeTLS(listener, s.config.CertFile, s.config.KeyFile)
		} else {
			err = s.server.Serve(listener)
		}
		if err != nil && err != http.ErrServerClosed {
			fmt.Printf("server error: %v\n", err)
		}
	}()

	return nil
}

// Stop 停止RPC服务器
func (s *TreasuryRPCServer) Stop(ctx context.Context) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if !s.running {
		return nil
	}

	s.running = false
	return s.server.Shutdown(ctx)
}

// IsRunning 检查服务器是否运行中
func (s *TreasuryRPCServer) IsRunning() bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.running
}

// Addr 返回服务器地址
func (s *TreasuryRPCServer) Addr() string {
	return net.JoinHostPort(s.config.Host, strconv.Itoa(s.config.Port))
}

// registerHandlers 注册HTTP处理器
func (s *TreasuryRPCServer) registerHandlers(mux *http.ServeMux) {
	// JSON-RPC 2.0 端点
	mux.HandleFunc("/rpc", s.handleJSONRPC)

	// RESTful 端点
	mux.HandleFunc("/api/v1/deposit", s.handleDeposit)
	mux.HandleFunc("/api/v1/withdraw", s.handleWithdraw)
	mux.HandleFunc("/api/v1/spend-request", s.handleSpendRequest)
	mux.HandleFunc("/api/v1/execute-outflow", s.handleExecuteOutflow)
	mux.HandleFunc("/api/v1/balance", s.handleGetBalance)
	mux.HandleFunc("/api/v1/pending-requests", s.handleGetPendingRequests)
	mux.HandleFunc("/api/v1/state", s.handleGetTreasuryState)
	mux.HandleFunc("/api/v1/transactions", s.handleGetTransactionHistory)

	// 健康检查
	mux.HandleFunc("/health", s.handleHealth)
}

// ========== JSON-RPC 2.0 支持 ==========

// JSONRPCRequest JSON-RPC请求
type JSONRPCRequest struct {
	JSONRPC string          `json:"jsonrpc"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params"`
	ID      interface{}     `json:"id"`
}

// JSONRPCResponse JSON-RPC响应
type JSONRPCResponse struct {
	JSONRPC string        `json:"jsonrpc"`
	Result  interface{}   `json:"result,omitempty"`
	Error   *JSONRPCError `json:"error,omitempty"`
	ID      interface{}   `json:"id"`
}

// JSONRPCError JSON-RPC错误
type JSONRPCError struct {
	Code    int         `json:"code"`
	Message string      `json:"message"`
	Data    interface{} `json:"data,omitempty"`
}

// handleJSONRPC 处理JSON-RPC请求
func (s *TreasuryRPCServer) handleJSONRPC(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		s.writeJSONRPCError(w, nil, -32600, "Invalid Request: only POST allowed")
		return
	}

	var req JSONRPCRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		s.writeJSONRPCError(w, nil, -32700, "Parse error")
		return
	}

	if req.JSONRPC != "2.0" {
		s.writeJSONRPCError(w, req.ID, -32600, "Invalid Request: jsonrpc must be 2.0")
		return
	}

	ctx := r.Context()
	result, rpcErr := s.dispatchMethod(ctx, req.Method, req.Params)
	if rpcErr != nil {
		s.writeJSONRPCErrorResponse(w, req.ID, rpcErr)
		return
	}

	s.writeJSONRPCSuccess(w, req.ID, result)
}

// dispatchMethod 分发RPC方法
func (s *TreasuryRPCServer) dispatchMethod(ctx context.Context, method string, params json.RawMessage) (interface{}, *JSONRPCError) {
	switch method {
	case "treasury.deposit":
		return s.rpcDeposit(ctx, params)
	case "treasury.withdraw":
		return s.rpcWithdraw(ctx, params)
	case "treasury.submitSpendRequest":
		return s.rpcSubmitSpendRequest(ctx, params)
	case "treasury.executeOutflow":
		return s.rpcExecuteOutflow(ctx, params)
	case "treasury.getBalance":
		return s.rpcGetBalance(ctx, params)
	case "treasury.getPendingRequests":
		return s.rpcGetPendingRequests(ctx, params)
	case "treasury.getState":
		return s.rpcGetTreasuryState(ctx, params)
	case "treasury.getTransactionHistory":
		return s.rpcGetTransactionHistory(ctx, params)
	default:
		return nil, &JSONRPCError{Code: -32601, Message: "Method not found"}
	}
}

func (s *TreasuryRPCServer) writeJSONRPCSuccess(w http.ResponseWriter, id interface{}, result interface{}) {
	resp := JSONRPCResponse{
		JSONRPC: "2.0",
		Result:  result,
		ID:      id,
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func (s *TreasuryRPCServer) writeJSONRPCError(w http.ResponseWriter, id interface{}, code int, message string) {
	s.writeJSONRPCErrorResponse(w, id, &JSONRPCError{Code: code, Message: message})
}

func (s *TreasuryRPCServer) writeJSONRPCErrorResponse(w http.ResponseWriter, id interface{}, rpcErr *JSONRPCError) {
	resp := JSONRPCResponse{
		JSONRPC: "2.0",
		Error:   rpcErr,
		ID:      id,
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

// ========== RPC方法实现 ==========

// DepositParams 资金流入参数
type DepositParams struct {
	Amount   uint64            `json:"amount"`
	Metadata *CoinbaseMetaJSON `json:"metadata,omitempty"`
}

// CoinbaseMetaJSON 区块奖励元数据JSON
type CoinbaseMetaJSON struct {
	BlockHeight uint64            `json:"block_height"`
	Producer    string            `json:"producer"`
	Reference   string            `json:"reference"`
	Memo        string            `json:"memo"`
	Extra       map[string]string `json:"extra,omitempty"`
}

// DepositResult 资金流入结果
type DepositResult struct {
	Success    bool   `json:"success"`
	TxID       string `json:"tx_id"`
	Message    string `json:"message"`
	NewBalance uint64 `json:"new_balance"`
}

func (s *TreasuryRPCServer) rpcDeposit(ctx context.Context, params json.RawMessage) (interface{}, *JSONRPCError) {
	var p DepositParams
	if err := json.Unmarshal(params, &p); err != nil {
		return nil, &JSONRPCError{Code: -32602, Message: "Invalid params: " + err.Error()}
	}

	if p.Amount == 0 {
		return nil, &JSONRPCError{Code: -32602, Message: "Invalid params: amount must be greater than zero"}
	}

	meta := consensus.CoinbaseMetadata{}
	if p.Metadata != nil {
		meta.BlockHeight = p.Metadata.BlockHeight
		meta.Producer = p.Metadata.Producer
		meta.Reference = p.Metadata.Reference
		meta.Memo = p.Metadata.Memo
		meta.Extra = p.Metadata.Extra
	}

	txID, err := s.treasury.HandleCoinbaseInflow(ctx, consensus.BCIAmount(p.Amount), meta)
	if err != nil {
		return nil, &JSONRPCError{Code: -32000, Message: err.Error()}
	}

	// 记录交易
	s.store.Save(&TransactionRecord{
		TxID:      txID,
		Type:      TransactionTypeInflow,
		Amount:    p.Amount,
		From:      "",
		To:        string(s.treasury.SystemAddress()),
		Timestamp: time.Now(),
		Memo:      meta.Memo,
	})

	balance, _ := s.treasury.PendingBalance(ctx)

	return &DepositResult{
		Success:    true,
		TxID:       txID,
		Message:    "Deposit successful",
		NewBalance: uint64(balance),
	}, nil
}

// WithdrawParams 资金流出参数
type WithdrawParams struct {
	To       string            `json:"to"`
	Amount   uint64            `json:"amount"`
	Metadata *TransferMetaJSON `json:"metadata,omitempty"`
}

// TransferMetaJSON 转账元数据JSON
type TransferMetaJSON struct {
	Reason     string   `json:"reason"`
	RuleIDs    []string `json:"rule_ids,omitempty"`
	RequestIDs []string `json:"request_ids,omitempty"`
	Operator   string   `json:"operator"`
	Reference  string   `json:"reference"`
	Memo       string   `json:"memo"`
}

// WithdrawResult 资金流出结果
type WithdrawResult struct {
	Success          bool   `json:"success"`
	TxID             string `json:"tx_id"`
	Message          string `json:"message"`
	RemainingBalance uint64 `json:"remaining_balance"`
}

func (s *TreasuryRPCServer) rpcWithdraw(ctx context.Context, params json.RawMessage) (interface{}, *JSONRPCError) {
	var p WithdrawParams
	if err := json.Unmarshal(params, &p); err != nil {
		return nil, &JSONRPCError{Code: -32602, Message: "Invalid params: " + err.Error()}
	}

	if p.To == "" {
		return nil, &JSONRPCError{Code: -32602, Message: "Invalid params: to address is required"}
	}
	if p.Amount == 0 {
		return nil, &JSONRPCError{Code: -32602, Message: "Invalid params: amount must be greater than zero"}
	}

	// 创建一个支出请求并立即执行
	req := consensus.SpendRequest{
		ID:     fmt.Sprintf("withdraw-%d", time.Now().UnixNano()),
		To:     consensus.Address(p.To),
		Amount: consensus.BCIAmount(p.Amount),
		Memo:   "",
	}
	if p.Metadata != nil {
		req.Memo = p.Metadata.Memo
	}

	if err := s.treasury.SubmitSpendRequest(req); err != nil {
		return nil, &JSONRPCError{Code: -32000, Message: err.Error()}
	}

	meta := consensus.TransferMetadata{}
	if p.Metadata != nil {
		meta.Reason = p.Metadata.Reason
		meta.RuleIDs = p.Metadata.RuleIDs
		meta.RequestIDs = p.Metadata.RequestIDs
		meta.Operator = p.Metadata.Operator
		meta.Reference = p.Metadata.Reference
		meta.Memo = p.Metadata.Memo
	}

	exec, err := s.treasury.ExecuteOutflow(ctx, meta)
	if err != nil {
		return nil, &JSONRPCError{Code: -32000, Message: err.Error()}
	}

	// 记录交易
	s.store.Save(&TransactionRecord{
		TxID:      exec.TxID,
		Type:      TransactionTypeOutflow,
		Amount:    uint64(exec.TotalAmount),
		From:      string(s.treasury.SystemAddress()),
		To:        p.To,
		Timestamp: time.Now(),
		Memo:      meta.Memo,
	})

	balance, _ := s.treasury.PendingBalance(ctx)

	return &WithdrawResult{
		Success:          true,
		TxID:             exec.TxID,
		Message:          "Withdrawal successful",
		RemainingBalance: uint64(balance),
	}, nil
}

// SpendRequestParams 提交支出请求参数
type SpendRequestParams struct {
	ID       string            `json:"id"`
	To       string            `json:"to"`
	Amount   uint64            `json:"amount"`
	Priority int               `json:"priority"`
	Memo     string            `json:"memo"`
	Metadata map[string]string `json:"metadata,omitempty"`
}

// SpendRequestResult 提交支出请求结果
type SpendRequestResult struct {
	Success   bool   `json:"success"`
	RequestID string `json:"request_id"`
	Message   string `json:"message"`
}

func (s *TreasuryRPCServer) rpcSubmitSpendRequest(ctx context.Context, params json.RawMessage) (interface{}, *JSONRPCError) {
	var p SpendRequestParams
	if err := json.Unmarshal(params, &p); err != nil {
		return nil, &JSONRPCError{Code: -32602, Message: "Invalid params: " + err.Error()}
	}

	req := consensus.SpendRequest{
		ID:       p.ID,
		To:       consensus.Address(p.To),
		Amount:   consensus.BCIAmount(p.Amount),
		Priority: p.Priority,
		Memo:     p.Memo,
		Metadata: p.Metadata,
	}

	if err := s.treasury.SubmitSpendRequest(req); err != nil {
		return nil, &JSONRPCError{Code: -32000, Message: err.Error()}
	}

	return &SpendRequestResult{
		Success:   true,
		RequestID: p.ID,
		Message:   "Spend request submitted",
	}, nil
}

// ExecuteOutflowParams 执行支出参数
type ExecuteOutflowParams struct {
	Metadata *TransferMetaJSON `json:"metadata,omitempty"`
}

// ExecuteOutflowResult 执行支出结果
type ExecuteOutflowResult struct {
	Success      bool               `json:"success"`
	TxID         string             `json:"tx_id"`
	TotalAmount  uint64             `json:"total_amount"`
	Instructions []TransferInstJSON `json:"instructions"`
	RuleIDs      []string           `json:"rule_ids"`
	RequestIDs   []string           `json:"request_ids"`
	Message      string             `json:"message"`
}

// TransferInstJSON 转账指令JSON
type TransferInstJSON struct {
	RequestID string `json:"request_id"`
	To        string `json:"to"`
	Amount    uint64 `json:"amount"`
	Memo      string `json:"memo"`
	RuleID    string `json:"rule_id"`
}

func (s *TreasuryRPCServer) rpcExecuteOutflow(ctx context.Context, params json.RawMessage) (interface{}, *JSONRPCError) {
	var p ExecuteOutflowParams
	if len(params) > 0 {
		if err := json.Unmarshal(params, &p); err != nil {
			return nil, &JSONRPCError{Code: -32602, Message: "Invalid params: " + err.Error()}
		}
	}

	meta := consensus.TransferMetadata{}
	if p.Metadata != nil {
		meta.Reason = p.Metadata.Reason
		meta.RuleIDs = p.Metadata.RuleIDs
		meta.RequestIDs = p.Metadata.RequestIDs
		meta.Operator = p.Metadata.Operator
		meta.Reference = p.Metadata.Reference
		meta.Memo = p.Metadata.Memo
	}

	exec, err := s.treasury.ExecuteOutflow(ctx, meta)
	if err != nil {
		return nil, &JSONRPCError{Code: -32000, Message: err.Error()}
	}

	instructions := make([]TransferInstJSON, len(exec.Instructions))
	for i, inst := range exec.Instructions {
		instructions[i] = TransferInstJSON{
			RequestID: inst.RequestID,
			To:        string(inst.To),
			Amount:    uint64(inst.Amount),
			Memo:      inst.Memo,
			RuleID:    inst.RuleID,
		}
	}

	// 记录交易
	s.store.Save(&TransactionRecord{
		TxID:      exec.TxID,
		Type:      TransactionTypeOutflow,
		Amount:    uint64(exec.TotalAmount),
		From:      string(s.treasury.SystemAddress()),
		To:        "",
		Timestamp: time.Now(),
		Memo:      meta.Memo,
	})

	return &ExecuteOutflowResult{
		Success:      true,
		TxID:         exec.TxID,
		TotalAmount:  uint64(exec.TotalAmount),
		Instructions: instructions,
		RuleIDs:      exec.RuleIDs,
		RequestIDs:   exec.RequestIDs,
		Message:      "Outflow executed",
	}, nil
}

// GetBalanceParams 查询余额参数
type GetBalanceParams struct {
	Address string `json:"address,omitempty"`
}

// GetBalanceResult 查询余额结果
type GetBalanceResult struct {
	Success bool   `json:"success"`
	Address string `json:"address"`
	Balance uint64 `json:"balance"`
	Message string `json:"message"`
}

func (s *TreasuryRPCServer) rpcGetBalance(ctx context.Context, params json.RawMessage) (interface{}, *JSONRPCError) {
	var p GetBalanceParams
	if len(params) > 0 {
		json.Unmarshal(params, &p)
	}

	addr := s.treasury.SystemAddress()
	if p.Address != "" {
		addr = consensus.Address(p.Address)
	}

	balance, err := s.treasury.PendingBalance(ctx)
	if err != nil {
		return nil, &JSONRPCError{Code: -32000, Message: err.Error()}
	}

	return &GetBalanceResult{
		Success: true,
		Address: string(addr),
		Balance: uint64(balance),
		Message: "Balance retrieved",
	}, nil
}

// GetPendingRequestsParams 查询待处理请求参数
type GetPendingRequestsParams struct {
	Limit  int `json:"limit,omitempty"`
	Offset int `json:"offset,omitempty"`
}

// GetPendingRequestsResult 查询待处理请求结果
type GetPendingRequestsResult struct {
	Success  bool               `json:"success"`
	Requests []SpendRequestJSON `json:"requests"`
	Total    int                `json:"total"`
	Message  string             `json:"message"`
}

// SpendRequestJSON 支出请求JSON
type SpendRequestJSON struct {
	ID       string            `json:"id"`
	To       string            `json:"to"`
	Amount   uint64            `json:"amount"`
	Priority int               `json:"priority"`
	Memo     string            `json:"memo"`
	Metadata map[string]string `json:"metadata,omitempty"`
}

func (s *TreasuryRPCServer) rpcGetPendingRequests(ctx context.Context, params json.RawMessage) (interface{}, *JSONRPCError) {
	var p GetPendingRequestsParams
	if len(params) > 0 {
		json.Unmarshal(params, &p)
	}

	pending := s.treasury.PendingRequests()
	total := len(pending)

	// 分页
	if p.Offset > 0 {
		if p.Offset >= len(pending) {
			pending = nil
		} else {
			pending = pending[p.Offset:]
		}
	}
	if p.Limit > 0 && len(pending) > p.Limit {
		pending = pending[:p.Limit]
	}

	requests := make([]SpendRequestJSON, len(pending))
	for i, req := range pending {
		requests[i] = SpendRequestJSON{
			ID:       req.ID,
			To:       string(req.To),
			Amount:   uint64(req.Amount),
			Priority: req.Priority,
			Memo:     req.Memo,
			Metadata: req.Metadata,
		}
	}

	return &GetPendingRequestsResult{
		Success:  true,
		Requests: requests,
		Total:    total,
		Message:  "Pending requests retrieved",
	}, nil
}

// GetTreasuryStateResult 查询国库状态结果
type GetTreasuryStateResult struct {
	Success       bool   `json:"success"`
	SystemAddress string `json:"system_address"`
	Balance       uint64 `json:"balance"`
	PendingCount  int    `json:"pending_count"`
	PendingTotal  uint64 `json:"pending_total"`
	Message       string `json:"message"`
}

func (s *TreasuryRPCServer) rpcGetTreasuryState(ctx context.Context, params json.RawMessage) (interface{}, *JSONRPCError) {
	balance, err := s.treasury.PendingBalance(ctx)
	if err != nil {
		return nil, &JSONRPCError{Code: -32000, Message: err.Error()}
	}

	pending := s.treasury.PendingRequests()
	var pendingTotal uint64
	for _, req := range pending {
		pendingTotal += uint64(req.Amount)
	}

	return &GetTreasuryStateResult{
		Success:       true,
		SystemAddress: string(s.treasury.SystemAddress()),
		Balance:       uint64(balance),
		PendingCount:  len(pending),
		PendingTotal:  pendingTotal,
		Message:       "Treasury state retrieved",
	}, nil
}

// GetTransactionHistoryParams 查询交易历史参数
type GetTransactionHistoryParams struct {
	Type      string `json:"type,omitempty"`
	StartTime int64  `json:"start_time,omitempty"`
	EndTime   int64  `json:"end_time,omitempty"`
	Limit     int    `json:"limit,omitempty"`
	Offset    int    `json:"offset,omitempty"`
}

// GetTransactionHistoryResult 查询交易历史结果
type GetTransactionHistoryResult struct {
	Success bool                    `json:"success"`
	Records []TransactionRecordJSON `json:"records"`
	Total   int                     `json:"total"`
	Message string                  `json:"message"`
}

// TransactionRecordJSON 交易记录JSON
type TransactionRecordJSON struct {
	TxID      string            `json:"tx_id"`
	Type      string            `json:"type"`
	Amount    uint64            `json:"amount"`
	From      string            `json:"from"`
	To        string            `json:"to"`
	Timestamp int64             `json:"timestamp"`
	Memo      string            `json:"memo"`
	Metadata  map[string]string `json:"metadata,omitempty"`
}

func (s *TreasuryRPCServer) rpcGetTransactionHistory(ctx context.Context, params json.RawMessage) (interface{}, *JSONRPCError) {
	var p GetTransactionHistoryParams
	if len(params) > 0 {
		json.Unmarshal(params, &p)
	}

	filter := TransactionFilter{
		Limit:  p.Limit,
		Offset: p.Offset,
	}

	if p.Type != "" {
		filter.Type = TransactionType(p.Type)
	}
	if p.StartTime > 0 {
		t := time.Unix(p.StartTime, 0)
		filter.StartTime = &t
	}
	if p.EndTime > 0 {
		t := time.Unix(p.EndTime, 0)
		filter.EndTime = &t
	}

	records, total, err := s.store.Query(filter)
	if err != nil {
		return nil, &JSONRPCError{Code: -32000, Message: err.Error()}
	}

	result := make([]TransactionRecordJSON, len(records))
	for i, rec := range records {
		result[i] = TransactionRecordJSON{
			TxID:      rec.TxID,
			Type:      string(rec.Type),
			Amount:    rec.Amount,
			From:      rec.From,
			To:        rec.To,
			Timestamp: rec.Timestamp.Unix(),
			Memo:      rec.Memo,
			Metadata:  rec.Metadata,
		}
	}

	return &GetTransactionHistoryResult{
		Success: true,
		Records: result,
		Total:   total,
		Message: "Transaction history retrieved",
	}, nil
}

// ========== RESTful端点处理 ==========

func (s *TreasuryRPCServer) handleDeposit(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var p DepositParams
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		s.writeJSON(w, http.StatusBadRequest, map[string]interface{}{
			"success": false,
			"message": "Invalid request body: " + err.Error(),
		})
		return
	}

	result, rpcErr := s.rpcDeposit(r.Context(), mustMarshal(p))
	if rpcErr != nil {
		s.writeJSON(w, http.StatusInternalServerError, map[string]interface{}{
			"success": false,
			"message": rpcErr.Message,
		})
		return
	}

	s.writeJSON(w, http.StatusOK, result)
}

func (s *TreasuryRPCServer) handleWithdraw(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var p WithdrawParams
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		s.writeJSON(w, http.StatusBadRequest, map[string]interface{}{
			"success": false,
			"message": "Invalid request body: " + err.Error(),
		})
		return
	}

	result, rpcErr := s.rpcWithdraw(r.Context(), mustMarshal(p))
	if rpcErr != nil {
		s.writeJSON(w, http.StatusInternalServerError, map[string]interface{}{
			"success": false,
			"message": rpcErr.Message,
		})
		return
	}

	s.writeJSON(w, http.StatusOK, result)
}

func (s *TreasuryRPCServer) handleSpendRequest(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var p SpendRequestParams
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		s.writeJSON(w, http.StatusBadRequest, map[string]interface{}{
			"success": false,
			"message": "Invalid request body: " + err.Error(),
		})
		return
	}

	result, rpcErr := s.rpcSubmitSpendRequest(r.Context(), mustMarshal(p))
	if rpcErr != nil {
		s.writeJSON(w, http.StatusInternalServerError, map[string]interface{}{
			"success": false,
			"message": rpcErr.Message,
		})
		return
	}

	s.writeJSON(w, http.StatusOK, result)
}

func (s *TreasuryRPCServer) handleExecuteOutflow(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var p ExecuteOutflowParams
	json.NewDecoder(r.Body).Decode(&p)

	result, rpcErr := s.rpcExecuteOutflow(r.Context(), mustMarshal(p))
	if rpcErr != nil {
		s.writeJSON(w, http.StatusInternalServerError, map[string]interface{}{
			"success": false,
			"message": rpcErr.Message,
		})
		return
	}

	s.writeJSON(w, http.StatusOK, result)
}

func (s *TreasuryRPCServer) handleGetBalance(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	p := GetBalanceParams{
		Address: r.URL.Query().Get("address"),
	}

	result, rpcErr := s.rpcGetBalance(r.Context(), mustMarshal(p))
	if rpcErr != nil {
		s.writeJSON(w, http.StatusInternalServerError, map[string]interface{}{
			"success": false,
			"message": rpcErr.Message,
		})
		return
	}

	s.writeJSON(w, http.StatusOK, result)
}

func (s *TreasuryRPCServer) handleGetPendingRequests(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))

	p := GetPendingRequestsParams{
		Limit:  limit,
		Offset: offset,
	}

	result, rpcErr := s.rpcGetPendingRequests(r.Context(), mustMarshal(p))
	if rpcErr != nil {
		s.writeJSON(w, http.StatusInternalServerError, map[string]interface{}{
			"success": false,
			"message": rpcErr.Message,
		})
		return
	}

	s.writeJSON(w, http.StatusOK, result)
}

func (s *TreasuryRPCServer) handleGetTreasuryState(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	result, rpcErr := s.rpcGetTreasuryState(r.Context(), nil)
	if rpcErr != nil {
		s.writeJSON(w, http.StatusInternalServerError, map[string]interface{}{
			"success": false,
			"message": rpcErr.Message,
		})
		return
	}

	s.writeJSON(w, http.StatusOK, result)
}

func (s *TreasuryRPCServer) handleGetTransactionHistory(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))
	startTime, _ := strconv.ParseInt(r.URL.Query().Get("start_time"), 10, 64)
	endTime, _ := strconv.ParseInt(r.URL.Query().Get("end_time"), 10, 64)

	p := GetTransactionHistoryParams{
		Type:      r.URL.Query().Get("type"),
		StartTime: startTime,
		EndTime:   endTime,
		Limit:     limit,
		Offset:    offset,
	}

	result, rpcErr := s.rpcGetTransactionHistory(r.Context(), mustMarshal(p))
	if rpcErr != nil {
		s.writeJSON(w, http.StatusInternalServerError, map[string]interface{}{
			"success": false,
			"message": rpcErr.Message,
		})
		return
	}

	s.writeJSON(w, http.StatusOK, result)
}

func (s *TreasuryRPCServer) handleHealth(w http.ResponseWriter, r *http.Request) {
	s.writeJSON(w, http.StatusOK, map[string]interface{}{
		"status":  "healthy",
		"service": "treasury-rpc",
	})
}

func (s *TreasuryRPCServer) writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func mustMarshal(v interface{}) json.RawMessage {
	data, _ := json.Marshal(v)
	return data
}
