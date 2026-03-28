# Treasury RPC 服务

本目录实现了国库（Treasury）模块的 RPC 通信服务，用于与其他区块链模块进行对接。

## 功能概述

### 支持的服务

| 服务 | 描述 | 方法 |
|------|------|------|
| 资金流入 (Deposit) | 处理区块奖励等资金进入国库 | `treasury.deposit` |
| 资金流出 (Withdraw) | 从国库直接转出资金 | `treasury.withdraw` |
| 提交支出请求 | 提交待审批的支出请求 | `treasury.submitSpendRequest` |
| 执行支出 | 执行规则评估后的资金流出 | `treasury.executeOutflow` |
| 查询余额 | 查询国库当前余额 | `treasury.getBalance` |
| 查询待处理请求 | 获取所有待处理的支出请求 | `treasury.getPendingRequests` |
| 查询国库状态 | 获取国库完整状态信息 | `treasury.getState` |
| 查询交易历史 | 查询资金流动历史记录 | `treasury.getTransactionHistory` |

## 通信协议

服务同时支持 **JSON-RPC 2.0** 和 **RESTful API** 两种通信方式。

### JSON-RPC 2.0

端点: `POST /rpc`

请求格式:
```json
{
    "jsonrpc": "2.0",
    "method": "treasury.deposit",
    "params": {
        "amount": 100000,
        "metadata": {
            "block_height": 12345,
            "producer": "node-1",
            "memo": "区块奖励"
        }
    },
    "id": 1
}
```

响应格式:
```json
{
    "jsonrpc": "2.0",
    "result": {
        "success": true,
        "tx_id": "mint-1234567890",
        "message": "Deposit successful",
        "new_balance": 100000
    },
    "id": 1
}
```

### RESTful API

| 端点 | 方法 | 描述 |
|------|------|------|
| `/api/v1/deposit` | POST | 资金流入 |
| `/api/v1/withdraw` | POST | 资金流出 |
| `/api/v1/spend-request` | POST | 提交支出请求 |
| `/api/v1/execute-outflow` | POST | 执行支出 |
| `/api/v1/balance` | GET | 查询余额 |
| `/api/v1/pending-requests` | GET | 查询待处理请求 |
| `/api/v1/state` | GET | 查询国库状态 |
| `/api/v1/transactions` | GET | 查询交易历史 |
| `/health` | GET | 健康检查 |

## 快速开始

### 启动服务器

```go
package main

import (
    "log"
    "treasury/consensus"
    "treasury/rpc"
)

func main() {
    // 创建执行器和规划器
    executor := consensus.NewInMemoryExecutor()
    planner := &YourPlanner{}

    // 创建国库实例
    treasury, _ := consensus.NewTreasury(
        consensus.Address("treasury-address"),
        executor,
        planner,
    )

    // 配置并启动RPC服务器
    config := rpc.DefaultServerConfig()
    config.Port = 9090

    server := rpc.NewTreasuryRPCServer(treasury, config, nil)
    server.Start()

    // 阻塞等待...
}
```

### 使用客户端

```go
package main

import (
    "context"
    "treasury/rpc"
)

func main() {
    config := rpc.DefaultClientConfig()
    config.ServerAddr = "localhost:9090"
    
    client := rpc.NewTreasuryRPCClient(config)
    ctx := context.Background()

    // 资金流入
    result, _ := client.Deposit(ctx, 100000, &rpc.CoinbaseMetaJSON{
        BlockHeight: 12345,
        Producer:    "node-1",
    })

    // 查询余额
    balance, _ := client.GetBalance(ctx, "")

    // 资金流出
    withdraw, _ := client.Withdraw(ctx, "recipient", 50000, nil)
}
```

## API 详细说明

### 1. 资金流入 (Deposit)

**用途**: 处理区块奖励、手续费收入等资金流入国库

**请求参数**:
```json
{
    "amount": 100000,           // 金额（必填）
    "metadata": {               // 元数据（可选）
        "block_height": 12345,
        "producer": "node-1",
        "reference": "block-reward",
        "memo": "区块奖励"
    }
}
```

**响应**:
```json
{
    "success": true,
    "tx_id": "mint-xxx",
    "message": "Deposit successful",
    "new_balance": 100000
}
```

### 2. 资金流出 (Withdraw)

**用途**: 直接从国库转出资金

**请求参数**:
```json
{
    "to": "recipient-address",  // 接收地址（必填）
    "amount": 50000,            // 金额（必填）
    "metadata": {               // 元数据（可选）
        "reason": "紧急拨款",
        "operator": "admin",
        "memo": "紧急资金调拨"
    }
}
```

**响应**:
```json
{
    "success": true,
    "tx_id": "transfer-xxx",
    "message": "Withdrawal successful",
    "remaining_balance": 50000
}
```

### 3. 提交支出请求 (SubmitSpendRequest)

**用途**: 提交待审批的支出请求，等待规则评估

**请求参数**:
```json
{
    "id": "spend-001",          // 请求ID（必填，唯一）
    "to": "recipient-address",  // 接收地址（必填）
    "amount": 25000,            // 金额（必填）
    "priority": 1,              // 优先级（可选）
    "memo": "社区激励",          // 备注（可选）
    "metadata": {}              // 扩展元数据（可选）
}
```

**响应**:
```json
{
    "success": true,
    "request_id": "spend-001",
    "message": "Spend request submitted"
}
```

### 4. 执行支出 (ExecuteOutflow)

**用途**: 触发规则评估并执行符合条件的支出

**请求参数**:
```json
{
    "metadata": {               // 元数据（可选）
        "reason": "批量执行",
        "operator": "system"
    }
}
```

**响应**:
```json
{
    "success": true,
    "tx_id": "transfer-xxx",
    "total_amount": 25000,
    "instructions": [...],
    "rule_ids": ["rule-1"],
    "request_ids": ["spend-001"],
    "message": "Outflow executed"
}
```

### 5. 查询余额 (GetBalance)

**用途**: 查询国库或指定地址的余额

**请求参数**:
```json
{
    "address": ""  // 地址（可选，默认查询国库地址）
}
```

**响应**:
```json
{
    "success": true,
    "address": "treasury-address",
    "balance": 75000,
    "message": "Balance retrieved"
}
```

### 6. 查询待处理请求 (GetPendingRequests)

**用途**: 获取所有待处理的支出请求列表

**请求参数**:
```json
{
    "limit": 10,   // 限制数量（可选，0表示全部）
    "offset": 0    // 偏移量（可选）
}
```

**响应**:
```json
{
    "success": true,
    "requests": [...],
    "total": 5,
    "message": "Pending requests retrieved"
}
```

### 7. 查询国库状态 (GetTreasuryState)

**用途**: 获取国库完整状态信息

**响应**:
```json
{
    "success": true,
    "system_address": "treasury-address",
    "balance": 75000,
    "pending_count": 3,
    "pending_total": 45000,
    "message": "Treasury state retrieved"
}
```

### 8. 查询交易历史 (GetTransactionHistory)

**用途**: 查询资金流动历史记录

**请求参数**:
```json
{
    "type": "inflow",      // 类型过滤（可选）: "inflow" | "outflow"
    "start_time": 0,       // 开始时间戳（可选）
    "end_time": 0,         // 结束时间戳（可选）
    "limit": 20,           // 限制数量（可选）
    "offset": 0            // 偏移量（可选）
}
```

**响应**:
```json
{
    "success": true,
    "records": [
        {
            "tx_id": "mint-xxx",
            "type": "inflow",
            "amount": 100000,
            "from": "",
            "to": "treasury-address",
            "timestamp": 1701849600,
            "memo": "区块奖励"
        }
    ],
    "total": 10,
    "message": "Transaction history retrieved"
}
```

## 配置选项

### 服务器配置

```go
type ServerConfig struct {
    Host           string        // 监听地址，默认 "0.0.0.0"
    Port           int           // 监听端口，默认 9090
    MaxRecvMsgSize int           // 最大接收消息大小，默认 4MB
    MaxSendMsgSize int           // 最大发送消息大小，默认 4MB
    ReadTimeout    time.Duration // 读取超时，默认 30s
    WriteTimeout   time.Duration // 写入超时，默认 30s
    EnableTLS      bool          // 是否启用TLS
    CertFile       string        // TLS证书文件路径
    KeyFile        string        // TLS密钥文件路径
}
```

### 客户端配置

```go
type ClientConfig struct {
    ServerAddr    string        // 服务器地址，默认 "localhost:9090"
    Timeout       time.Duration // 请求超时，默认 30s
    EnableTLS     bool          // 是否启用TLS
    CertFile      string        // TLS证书文件路径
    Insecure      bool          // 是否跳过证书验证
    MaxRetries    int           // 最大重试次数，默认 3
    RetryInterval time.Duration // 重试间隔，默认 1s
}
```

## 错误处理

JSON-RPC 错误码:

| 错误码 | 描述 |
|--------|------|
| -32700 | 解析错误 |
| -32600 | 无效请求 |
| -32601 | 方法不存在 |
| -32602 | 无效参数 |
| -32000 | 服务器错误 |

## 测试

运行单元测试:

```bash
go test -v ./rpc/...
```

## 文件结构

```
rpc/
├── proto/
│   └── treasury.proto    # Protocol Buffers 定义（可选用于gRPC）
├── types.go              # 类型定义
├── server.go             # RPC服务器实现
├── client.go             # RPC客户端实现
├── server_test.go        # 单元测试
└── README.md             # 本文档

cmd/
├── treasury-rpc/
│   └── main.go           # 服务器启动入口
└── client-example/
    └── main.go           # 客户端使用示例
```

## 与其他模块对接

### 区块链共识模块对接

```go
// 在出块时调用资金流入
func OnBlockProduced(block *Block) {
    client.Deposit(ctx, block.Reward, &CoinbaseMetaJSON{
        BlockHeight: block.Height,
        Producer:    block.Producer,
    })
}
```

### 治理模块对接

```go
// 治理提案通过后调用资金流出
func OnProposalPassed(proposal *Proposal) {
    client.SubmitSpendRequest(ctx,
        proposal.ID,
        proposal.Recipient,
        proposal.Amount,
        proposal.Priority,
        proposal.Description,
        nil,
    )
}
```

### 监控模块对接

```go
// 定期获取国库状态
func MonitorTreasury() {
    state, _ := client.GetTreasuryState(ctx)
    metrics.SetGauge("treasury_balance", float64(state.Balance))
    metrics.SetGauge("treasury_pending_count", float64(state.PendingCount))
}
```


┌─────────────────────────────────────────────────────────────────┐
│                      其他区块链模块                              │
│  (共识模块、治理模块、监控模块等)                                 │
└─────────────────────┬───────────────────────────────────────────┘
                      │ 调用
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                   RPC Client (client.go)                        │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  • Deposit()          • GetBalance()                    │    │
│  │  • Withdraw()         • GetPendingRequests()            │    │
│  │  • SubmitSpendRequest()  • GetTreasuryState()           │    │
│  │  • ExecuteOutflow()   • GetTransactionHistory()         │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────┬───────────────────────────────────────────┘
                      │ HTTP 请求 (JSON-RPC / REST)
                      │ 网络传输
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                   RPC Server (server.go)                        │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  • 监听端口 (默认 9090)                                  │    │
│  │  • 解析请求、路由分发                                    │    │
│  │  • 调用 Treasury 核心逻辑                                │    │
│  │  • 返回响应结果                                          │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────┬───────────────────────────────────────────┘
                      │ 调用
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Treasury 核心 (consensus/)                    │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  treasury.go  - 国库主逻辑                               │    │
│  │  executor.go  - UTXO 执行器                              │    │
│  │  rules.go     - 规则引擎                                 │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘