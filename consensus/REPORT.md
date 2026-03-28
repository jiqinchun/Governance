# 共识层国库模块功能概览（组会汇报版）

---

## II. 国库共识层模块功能概览 (Go语言实现)

1.  **新增** **资金入账机制 (`HandleCoinbaseInflow`)**
    | 支持共识层新产出的 BCI 原生代币流入，通过调用 `UTXOExecutor.Mint` 方法将代币铸造至指定的系统级 UTXO 地址，并记录包含区块高度、生产者、交易ID等元数据的日志信息。

2.  **新增** **支出请求管理与队列 (`SubmitSpendRequest` / `PendingRequests`)**
    | 提供提交支出请求的接口，请求包含唯一ID、目标地址、支出金额、优先级和备注等信息；实现对重复请求ID的校验，并维护一个线程安全的内存队列，支持随时获取待处理支出请求的快照。

3.  **新增** **规则化出账执行 (`ExecuteOutflow`)**
    | 根据系统 UTXO 地址的当前余额，调用预设的规则规划器（默认采用 **FIFO 规则**）筛选出可执行的支出请求；生成 `TransferRequest` 并通过 `UTXOExecutor.Transfer` 方法下发交易；成功执行后，从队列中移除已处理的请求，并返回包含交易ID、总金额、执行的规则ID和请求ID等信息的执行摘要。

4.  **新增** **可插拔规则引擎 (`RuleEngine` + `FirstInFirstOutRule`)**
    | 设计了灵活的规则引擎架构，支持顺序运行多条自定义出账规则；默认实现了 **`FirstInFirstOutRule`**，该规则在保留最小余额（MinReserve）的前提下，按照请求提交的先后顺序（FIFO）选择支出请求，并支持限制批量出账数量（MaxBatchSize）以控制单次交易的复杂度。

5.  **新增** **UTXO 执行器抽象与内存实现 (`UTXOExecutor`, `InMemoryExecutor`)**
    | 定义了与共识客户端交互的 `UTXOExecutor` 接口，抽象了 UTXO 的铸造（Mint）、转账（Transfer）和余额查询（Balance）等核心操作；提供了线程安全的 **`InMemoryExecutor`** 内存实现，主要用于单元测试和模拟环境，支持原子性的余额操作和交易ID生成。

6.  **新增** **核心数据类型定义 (`types.go`)**
    | 统一了 `Address`、`BCIAmount`、`SpendRequest`、`TransferInstruction`、`TreasuryState`、`OutflowExecution` 等关键数据结构，确保模块内部及与外部交互的数据一致性与可审计性；包含完整的元数据字段（如 `CoinbaseMetadata`、`TransferMetadata`）以支持追溯和审计。

7.  **新增** **全面单元测试 (`treasury_test.go`)**
    | 编写了覆盖 BCI 流入处理、FIFO 规则出账、保留余额逻辑、重复请求校验、余额不足处理等核心场景的单元测试，使用内存执行器验证模块功能的正确性和稳定性，确保所有测试用例通过。

---

## 技术架构特点

- **线程安全**: 使用 `sync.Mutex` 保护共享状态，确保并发环境下的数据一致性
- **可扩展性**: 通过接口抽象和规则引擎设计，支持灵活扩展新的出账规则
- **可测试性**: 提供内存执行器实现，便于单元测试和集成测试
- **可审计性**: 完整的元数据和日志记录，支持资金流向追溯
- **错误处理**: 完善的错误定义和处理机制，包括余额不足、重复请求等场景

## 测试状态

✅ 所有单元测试通过 (`go test ./consensus`)

















