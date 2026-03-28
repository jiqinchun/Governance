package rpc

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// TreasuryRPCClient 国库RPC客户端
type TreasuryRPCClient struct {
	config     *ClientConfig
	httpClient *http.Client
}

// NewTreasuryRPCClient 创建国库RPC客户端
func NewTreasuryRPCClient(config *ClientConfig) *TreasuryRPCClient {
	if config == nil {
		config = DefaultClientConfig()
	}

	return &TreasuryRPCClient{
		config: config,
		httpClient: &http.Client{
			Timeout: config.Timeout,
		},
	}
}

// ========== 资金流入 ==========

// Deposit 资金流入
func (c *TreasuryRPCClient) Deposit(ctx context.Context, amount uint64, metadata *CoinbaseMetaJSON) (*DepositResult, error) {
	params := DepositParams{
		Amount:   amount,
		Metadata: metadata,
	}

	var result DepositResult
	if err := c.callRPC(ctx, "treasury.deposit", params, &result); err != nil {
		return nil, err
	}

	return &result, nil
}

// ========== 资金流出 ==========

// Withdraw 资金流出
func (c *TreasuryRPCClient) Withdraw(ctx context.Context, to string, amount uint64, metadata *TransferMetaJSON) (*WithdrawResult, error) {
	params := WithdrawParams{
		To:       to,
		Amount:   amount,
		Metadata: metadata,
	}

	var result WithdrawResult
	if err := c.callRPC(ctx, "treasury.withdraw", params, &result); err != nil {
		return nil, err
	}

	return &result, nil
}

// ========== 提交支出请求 ==========

// SubmitSpendRequest 提交支出请求
func (c *TreasuryRPCClient) SubmitSpendRequest(ctx context.Context, id, to string, amount uint64, priority int, memo string, metadata map[string]string) (*SpendRequestResult, error) {
	params := SpendRequestParams{
		ID:       id,
		To:       to,
		Amount:   amount,
		Priority: priority,
		Memo:     memo,
		Metadata: metadata,
	}

	var result SpendRequestResult
	if err := c.callRPC(ctx, "treasury.submitSpendRequest", params, &result); err != nil {
		return nil, err
	}

	return &result, nil
}

// ========== 执行支出 ==========

// ExecuteOutflow 执行支出
func (c *TreasuryRPCClient) ExecuteOutflow(ctx context.Context, metadata *TransferMetaJSON) (*ExecuteOutflowResult, error) {
	params := ExecuteOutflowParams{
		Metadata: metadata,
	}

	var result ExecuteOutflowResult
	if err := c.callRPC(ctx, "treasury.executeOutflow", params, &result); err != nil {
		return nil, err
	}

	return &result, nil
}

// ========== 查询余额 ==========

// GetBalance 查询余额
func (c *TreasuryRPCClient) GetBalance(ctx context.Context, address string) (*GetBalanceResult, error) {
	params := GetBalanceParams{
		Address: address,
	}

	var result GetBalanceResult
	if err := c.callRPC(ctx, "treasury.getBalance", params, &result); err != nil {
		return nil, err
	}

	return &result, nil
}

// ========== 查询待处理请求 ==========

// GetPendingRequests 查询待处理请求
func (c *TreasuryRPCClient) GetPendingRequests(ctx context.Context, limit, offset int) (*GetPendingRequestsResult, error) {
	params := GetPendingRequestsParams{
		Limit:  limit,
		Offset: offset,
	}

	var result GetPendingRequestsResult
	if err := c.callRPC(ctx, "treasury.getPendingRequests", params, &result); err != nil {
		return nil, err
	}

	return &result, nil
}

// ========== 查询国库状态 ==========

// GetTreasuryState 查询国库状态
func (c *TreasuryRPCClient) GetTreasuryState(ctx context.Context) (*GetTreasuryStateResult, error) {
	var result GetTreasuryStateResult
	if err := c.callRPC(ctx, "treasury.getState", nil, &result); err != nil {
		return nil, err
	}

	return &result, nil
}

// ========== 查询交易历史 ==========

// GetTransactionHistory 查询交易历史
func (c *TreasuryRPCClient) GetTransactionHistory(ctx context.Context, txType string, startTime, endTime int64, limit, offset int) (*GetTransactionHistoryResult, error) {
	params := GetTransactionHistoryParams{
		Type:      txType,
		StartTime: startTime,
		EndTime:   endTime,
		Limit:     limit,
		Offset:    offset,
	}

	var result GetTransactionHistoryResult
	if err := c.callRPC(ctx, "treasury.getTransactionHistory", params, &result); err != nil {
		return nil, err
	}

	return &result, nil
}

// ========== 内部方法 ==========

// callRPC 发送JSON-RPC请求
func (c *TreasuryRPCClient) callRPC(ctx context.Context, method string, params interface{}, result interface{}) error {
	var paramsJSON json.RawMessage
	if params != nil {
		var err error
		paramsJSON, err = json.Marshal(params)
		if err != nil {
			return fmt.Errorf("failed to marshal params: %w", err)
		}
	}

	reqBody := JSONRPCRequest{
		JSONRPC: "2.0",
		Method:  method,
		Params:  paramsJSON,
		ID:      time.Now().UnixNano(),
	}

	bodyBytes, err := json.Marshal(reqBody)
	if err != nil {
		return fmt.Errorf("failed to marshal request: %w", err)
	}

	url := c.buildURL("/rpc")
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(bodyBytes))
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")

	var resp *http.Response
	var lastErr error

	for i := 0; i <= c.config.MaxRetries; i++ {
		resp, lastErr = c.httpClient.Do(req)
		if lastErr == nil {
			break
		}
		if i < c.config.MaxRetries {
			time.Sleep(c.config.RetryInterval)
		}
	}

	if lastErr != nil {
		return fmt.Errorf("request failed after %d retries: %w", c.config.MaxRetries, lastErr)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("failed to read response body: %w", err)
	}

	var rpcResp JSONRPCResponse
	if err := json.Unmarshal(body, &rpcResp); err != nil {
		return fmt.Errorf("failed to parse response: %w", err)
	}

	if rpcResp.Error != nil {
		return fmt.Errorf("rpc error [%d]: %s", rpcResp.Error.Code, rpcResp.Error.Message)
	}

	if result != nil && rpcResp.Result != nil {
		resultBytes, err := json.Marshal(rpcResp.Result)
		if err != nil {
			return fmt.Errorf("failed to marshal result: %w", err)
		}
		if err := json.Unmarshal(resultBytes, result); err != nil {
			return fmt.Errorf("failed to unmarshal result: %w", err)
		}
	}

	return nil
}

// buildURL 构建完整URL
func (c *TreasuryRPCClient) buildURL(path string) string {
	scheme := "http"
	if c.config.EnableTLS {
		scheme = "https"
	}
	return fmt.Sprintf("%s://%s%s", scheme, c.config.ServerAddr, path)
}

// ========== 便捷方法 ==========

// DepositREST 使用REST API进行资金流入
func (c *TreasuryRPCClient) DepositREST(ctx context.Context, amount uint64, metadata *CoinbaseMetaJSON) (*DepositResult, error) {
	params := DepositParams{
		Amount:   amount,
		Metadata: metadata,
	}

	var result DepositResult
	if err := c.postREST(ctx, "/api/v1/deposit", params, &result); err != nil {
		return nil, err
	}

	return &result, nil
}

// WithdrawREST 使用REST API进行资金流出
func (c *TreasuryRPCClient) WithdrawREST(ctx context.Context, to string, amount uint64, metadata *TransferMetaJSON) (*WithdrawResult, error) {
	params := WithdrawParams{
		To:       to,
		Amount:   amount,
		Metadata: metadata,
	}

	var result WithdrawResult
	if err := c.postREST(ctx, "/api/v1/withdraw", params, &result); err != nil {
		return nil, err
	}

	return &result, nil
}

// GetBalanceREST 使用REST API查询余额
func (c *TreasuryRPCClient) GetBalanceREST(ctx context.Context, address string) (*GetBalanceResult, error) {
	path := "/api/v1/balance"
	if address != "" {
		path += "?address=" + address
	}

	var result GetBalanceResult
	if err := c.getREST(ctx, path, &result); err != nil {
		return nil, err
	}

	return &result, nil
}

// GetTreasuryStateREST 使用REST API查询国库状态
func (c *TreasuryRPCClient) GetTreasuryStateREST(ctx context.Context) (*GetTreasuryStateResult, error) {
	var result GetTreasuryStateResult
	if err := c.getREST(ctx, "/api/v1/state", &result); err != nil {
		return nil, err
	}

	return &result, nil
}

// postREST 发送POST请求
func (c *TreasuryRPCClient) postREST(ctx context.Context, path string, params interface{}, result interface{}) error {
	bodyBytes, err := json.Marshal(params)
	if err != nil {
		return fmt.Errorf("failed to marshal params: %w", err)
	}

	url := c.buildURL(path)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(bodyBytes))
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("failed to read response body: %w", err)
	}

	if err := json.Unmarshal(body, result); err != nil {
		return fmt.Errorf("failed to parse response: %w", err)
	}

	return nil
}

// getREST 发送GET请求
func (c *TreasuryRPCClient) getREST(ctx context.Context, path string, result interface{}) error {
	url := c.buildURL(path)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("failed to read response body: %w", err)
	}

	if err := json.Unmarshal(body, result); err != nil {
		return fmt.Errorf("failed to parse response: %w", err)
	}

	return nil
}
