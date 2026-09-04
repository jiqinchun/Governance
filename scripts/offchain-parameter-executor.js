const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

const DEPLOYED_PATH = path.join(__dirname, "upgrade_process", "deployed.json");
const PARAMETER_MAP_PATH = path.join(__dirname, "parameter-id-map.json");
const STATE_PATH =
  process.env.EXECUTOR_STATE_PATH ||
  path.join(__dirname, "offchain-executor-state.json");

const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS || 10_000);
const CONFIRMATIONS = Number(process.env.CONFIRMATIONS || 1);
const START_BLOCK = Number(process.env.START_BLOCK || 710);
const RUN_ONCE = process.env.RUN_ONCE === "1";
const DRY_RUN = process.env.DRY_RUN === "1";
const FROM_BLOCK_OVERRIDE = process.env.FROM_BLOCK_OVERRIDE
  ? Number(process.env.FROM_BLOCK_OVERRIDE)
  : null;

const DEFAULT_RPC_URLS = parseUrlList(
  process.env.EXECUTOR_RPC_URLS || "http://47.243.174.71:36054"
);
const DEFAULT_RPC_METHOD =
  process.env.EXECUTOR_RPC_METHOD || "governance_applyParameterUpdate";

function parseUrlList(value) {
  return (value || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function zoneEnvPrefix(zone) {
  return String(zone || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "_");
}

function getZoneRpcUrls(zone) {
  const envName = `${zoneEnvPrefix(zone)}_RPC_URLS`;
  const zoneUrls = parseUrlList(process.env[envName]);
  return zoneUrls.length > 0 ? zoneUrls : DEFAULT_RPC_URLS;
}

function getZoneRpcMethod(zone) {
  const envName = `${zoneEnvPrefix(zone)}_RPC_METHOD`;
  return process.env[envName] || DEFAULT_RPC_METHOD;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ensureFile(filePath, defaultValue) {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(defaultValue, null, 2));
  }
}

function loadJSON(filePath) {
  const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
  if (filePath.includes("executor-state.json")) {
    if (data.lastProcessedBlock < START_BLOCK) {
      data.lastProcessedBlock = START_BLOCK;
    }
  }
  return data;
}

function normalizeMap(rawMap) {
  const normalized = {};
  for (const [k, v] of Object.entries(rawMap)) {
    normalized[k.toLowerCase()] = v;
  }
  return normalized;
}

function getEventLogIndex(evt) {
  if (typeof evt.logIndex === "number") return evt.logIndex;
  if (typeof evt.index === "number") return evt.index;
  return 0;
}

function decodeByType(hexData, valueType) {
  try {
    const abi = ethers.AbiCoder.defaultAbiCoder();
    if (!valueType || valueType === "bytes") {
      return hexData;
    }
    if (valueType === "uint256") {
      return abi.decode(["uint256"], hexData)[0].toString();
    }
    if (valueType === "int256") {
      return abi.decode(["int256"], hexData)[0].toString();
    }
    if (valueType === "bool") {
      return abi.decode(["bool"], hexData)[0];
    }
    if (valueType === "address") {
      return abi.decode(["address"], hexData)[0];
    }
    if (valueType === "bytes32") {
      return abi.decode(["bytes32"], hexData)[0];
    }
    if (valueType === "string") {
      return abi.decode(["string"], hexData)[0];
    }
    return hexData;
  } catch {
    return hexData;
  }
}

async function sendJsonRpc(url, method, params) {
  const body = {
    jsonrpc: "2.0",
    id: Date.now(),
    method,
    params
  };

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  const text = await resp.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`invalid JSON-RPC response from ${url}: ${text}`);
  }

  if (!resp.ok) {
    throw new Error(`http ${resp.status} from ${url}: ${text}`);
  }
  if (parsed.error) {
    throw new Error(`rpc error from ${url}: ${JSON.stringify(parsed.error)}`);
  }

  return parsed.result;
}

function buildPayload(eventArgs, eventMeta, chainId, parameterMeta, blockTimestamp) {
  const proposalId = eventArgs.proposalId.toString();
  const parameterId = eventArgs.parameterId.toLowerCase();
  const oldValueHex = eventArgs.oldValue;
  const newValueHex = eventArgs.newValue;

  return {
    proposalId,
    parameterId,
    parameterName: parameterMeta.name,
    zone: parameterMeta.zone,
    valueType: parameterMeta.valueType || "bytes",
    oldValue: {
      rawHex: oldValueHex,
      decoded: decodeByType(oldValueHex, parameterMeta.valueType)
    },
    newValue: {
      rawHex: newValueHex,
      decoded: decodeByType(newValueHex, parameterMeta.valueType)
    },
    chainId: Number(chainId),
    blockNumber: eventMeta.blockNumber,
    blockHash: eventMeta.blockHash,
    txHash: eventMeta.transactionHash,
    logIndex: getEventLogIndex(eventMeta),
    executedAt: new Date(Number(blockTimestamp) * 1000).toISOString(),
    effectiveHeight: eventMeta.blockNumber + 100000
  };
}

async function dispatchToZone(payload) {
  const rpcUrls = getZoneRpcUrls(payload.zone);
  const rpcMethod = getZoneRpcMethod(payload.zone);

  if (rpcUrls.length === 0) {
    console.log(`[SKIP] no rpc urls configured for zone=${payload.zone}`);
    return;
  }

  if (DRY_RUN) {
    console.log(
      "[DRY_RUN] skip RPC dispatch:",
      JSON.stringify(
        {
          zone: payload.zone,
          method: rpcMethod,
          urls: rpcUrls,
          payload
        },
        null,
        2
      )
    );
    return;
  }

  for (const url of rpcUrls) {
    const result = await sendJsonRpc(url, rpcMethod, [payload]);
    console.log(`[RPC_OK] zone=${payload.zone} ${url} =>`, result);
  }
}

async function handleEvent(evt, provider, chainId, parameterMap) {
  const parameterId = evt.args.parameterId.toLowerCase();
  const parameterMeta = parameterMap[parameterId];

  if (!parameterMeta) {
    throw new Error(
      `unknown parameterId ${parameterId}. Add it to scripts/parameter-id-map.json before dispatching.`
    );
  }

  const block = await provider.getBlock(evt.blockNumber);
  const payload = buildPayload(evt.args, evt, chainId, parameterMeta, block.timestamp);

  console.log(
    `[EVENT] proposal=${payload.proposalId} parameter=${payload.parameterName} zone=${payload.zone} block=${payload.blockNumber}`
  );

  await dispatchToZone(payload);
}

function nextQueryToBlock(latestBlock) {
  const toBlock = latestBlock - CONFIRMATIONS;
  return toBlock < 0 ? 0 : toBlock;
}

async function main() {
  ensureFile(STATE_PATH, {
    lastProcessedBlock: START_BLOCK,
    lastProcessedLogIndex: -1
  });

  const state = loadJSON(STATE_PATH);
  if (typeof state.lastProcessedLogIndex !== "number") {
    state.lastProcessedLogIndex = -1;
  }
  const deployed = loadJSON(DEPLOYED_PATH);
  const parameterMap = normalizeMap(loadJSON(PARAMETER_MAP_PATH));

  const provider = ethers.provider;
  const network = await provider.getNetwork();
  const chainId = network.chainId;

  const paramRegistry = await ethers.getContractAt(
    "ParameterRegistry",
    deployed.paramRegistry
  );

  console.log("Off-chain parameter executor started");
  console.log("- chainId:", Number(chainId));
  console.log("- registry:", deployed.paramRegistry);
  console.log("- default rpc urls:", DEFAULT_RPC_URLS);
  console.log("- start cursor:", state);
  if (FROM_BLOCK_OVERRIDE !== null) {
    console.log("- from block override:", FROM_BLOCK_OVERRIDE);
  }
  console.log("- dry run:", DRY_RUN);

  while (true) {
    try {
      const latestBlock = await provider.getBlockNumber();
      const toBlock = nextQueryToBlock(latestBlock);
      const cursorBlock = Number(state.lastProcessedBlock || START_BLOCK);
      const fromBlock =
        FROM_BLOCK_OVERRIDE !== null
          ? FROM_BLOCK_OVERRIDE
          : Math.max(START_BLOCK, cursorBlock);

      if (toBlock < fromBlock) {
        if (RUN_ONCE) break;
        await sleep(POLL_INTERVAL_MS);
        continue;
      }

      const events = await paramRegistry.queryFilter(
        paramRegistry.filters.ProposalExecuted(),
        fromBlock,
        toBlock
      );

      events.sort((a, b) => {
        if (a.blockNumber !== b.blockNumber) return a.blockNumber - b.blockNumber;
        return getEventLogIndex(a) - getEventLogIndex(b);
      });

      for (const evt of events) {
        const eventLogIndex = getEventLogIndex(evt);
        if (
          evt.blockNumber === state.lastProcessedBlock &&
          eventLogIndex <= state.lastProcessedLogIndex
        ) {
          continue;
        }

        await handleEvent(evt, provider, chainId, parameterMap);

        if (!DRY_RUN) {
          state.lastProcessedBlock = evt.blockNumber;
          state.lastProcessedLogIndex = eventLogIndex;
          fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
        }
      }

      if (RUN_ONCE) {
        break;
      }

      await sleep(POLL_INTERVAL_MS);
    } catch (error) {
      console.error("[LOOP_ERROR]", error);
      if (RUN_ONCE) {
        throw error;
      }
      await sleep(POLL_INTERVAL_MS);
    }
  }

  console.log("Off-chain parameter executor finished.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Executor failed:", error);
    process.exit(1);
  });
