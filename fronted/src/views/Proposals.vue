<template>
  <div class="proposals-container">
    <!-- Top Stats Section -->
    <div class="stats-header">
      <div class="go-back-section">
        <a-button class="go-back-btn">
          <template #icon><ArrowLeftOutlined style="font-size: 14px;" /></template>
          Go Back
        </a-button>
      </div>

      <div class="stat-items">
        <div class="stat-box">
          <div class="stat-label">My Voting Power</div>
          <div class="stat-value voting-power">
            <svg class="a-icon" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="14" cy="14" r="14" fill="#92A3FE"/>
              <path d="M14.0003 7L21.0003 19.5H7.00033L14.0003 7Z" fill="white"/>
            </svg>
            1150
          </div>
        </div>
        <div class="stat-box">
          <div class="stat-label">My Votes</div>
          <div class="stat-value">15</div>
        </div>
        <div class="stat-box">
          <div class="stat-label">My Proposition Power</div>
          <div class="stat-value">120</div>
        </div>
        <div class="stat-box last-stat">
          <div class="stat-label">My Proposals</div>
          <div class="stat-value proposals-view">
            15 <a-button size="small" class="view-btn">View</a-button>
          </div>
        </div>
      </div>
    </div>

    <!-- Filter Bar -->
    <div class="filter-bar">
      <div class="search-wrap">
        <a-input placeholder="Search for proposals by their name" class="search-input">
          <template #prefix>
            <SearchOutlined style="color: rgba(0,0,0,.25)" />
          </template>
        </a-input>
      </div>

      <div class="actions-wrap">
        <div class="select-group">
          <span class="select-label">Filter</span>
          <a-select v-model:value="filterValue" class="custom-select" :bordered="false">
            <a-select-option value="all">All Proposals</a-select-option>
            <a-select-option value="active">Active</a-select-option>
          </a-select>
        </div>

        <div class="split-line"></div>

        <div class="select-group">
          <span class="select-label">Sort By</span>
          <a-select v-model:value="sortValue" class="custom-select" :bordered="false">
            <a-select-option value="asc">Ascending</a-select-option>
            <a-select-option value="desc">Descending</a-select-option>
          </a-select>
        </div>

        <a-button type="primary" class="new-proposal-btn" @click="showCreateModal">
          New Proposal <PlusOutlined />
        </a-button>
      </div>
    </div>

    <!-- Create Proposal Modal -->
    <a-modal
      v-model:open="isModalVisible"
      title="Create Proposal"
      :footer="null"
      width="600px"
      :class="'custom-create-modal'"
      :afterClose="resetForm"
    >
      <a-form layout="vertical" :model="proposalForm" @finish="handleCreateProposal">
        <div style="display: flex; gap: 16px;">
          <a-form-item label="Parameter Name" name="name" :rules="[{ required: true, message: 'Please provide parameter name' }]" style="flex: 1;">
            <a-input v-model:value="proposalForm.name" placeholder="e.g. minPowGas" size="large" />
          </a-form-item>

          <a-form-item label="Category" name="category" :rules="[{ required: true, message: 'Please provide category' }]" style="flex: 1;">
            <a-input v-model:value="proposalForm.category" placeholder="e.g. execution" size="large" />
          </a-form-item>
        </div>

        <a-form-item label="New Value" name="newValue" :rules="[{ required: true, message: 'Please provide new value' }]">
          <a-input v-model:value="proposalForm.newValue" placeholder="provide new value (e.g. 2000000)" size="large" />
        </a-form-item>

        <a-form-item label="Description" name="description" :rules="[{ required: true, message: 'Please provide description' }]">
          <a-textarea v-model:value="proposalForm.description" placeholder="e.g. It is proposed that the minPowGas value for the execution zone be changed from 1,000,000 to 2,000,000, for the following reasons:" :rows="6" size="large" />
        </a-form-item>

        <a-form-item style="margin-bottom: 0;">
          <a-button type="primary" html-type="submit" block size="large" class="submit-btn" :loading="isCreating">
            Create Proposal
          </a-button>
        </a-form-item>
      </a-form>
    </a-modal>

    <!-- Data Table -->
    <a-table
      :columns="columns"
      :data-source="data"
      :loading="isLoadingTable"
      :pagination="paginationConfig"
      class="custom-table"
      :rowClassName="() => 'custom-table-row'"
      :customRow="(record) => ({
        onClick: () => goToDetail(record.key)
      })"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'proposal'">
          <div class="proposal-title" @click.stop="goToDetail(record.key)">
            {{ record.proposal }}
            <ArrowRightOutlined class="link-icon" />
          </div>
        </template>
        
        <template v-else-if="column.key === 'state'">
          <div :class="['state-tag', record.state.toLowerCase()]">
            <span class="dot"></span> {{ record.state }}
          </div>
        </template>
      </template>
    </a-table>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import { ethers } from 'ethers'
import ParameterRegistryArtifact from '../../../artifacts/contracts/ParameterRegistry.sol/ParameterRegistry.json'
import deployedData from '../../../scripts/upgrade_process/deployed.json'
import {
  ArrowLeftOutlined,
  SearchOutlined,
  PlusOutlined,
  ArrowRightOutlined
} from '@ant-design/icons-vue'

const router = useRouter()
const filterValue = ref('all')
const sortValue = ref('asc')

const isModalVisible = ref(false)
const isCreating = ref(false)

const proposalForm = reactive({
  name: '',
  category: '',
  newValue: '',
  description: ''
})

const showCreateModal = () => {
  isModalVisible.value = true
}

const resetForm = () => {
  proposalForm.name = ''
  proposalForm.category = ''
  proposalForm.newValue = ''
  proposalForm.description = ''
}

const PK_DEPLOYER = "eeefa7075d12e965851eef8e2622377d480f8b9c99c30cb615cf222b699b491f"
const RPC_URL = "http://47.243.174.71:36054"

const handleCreateProposal = async () => {
  isCreating.value = true
  try {
    const provider = new ethers.JsonRpcProvider(RPC_URL)
    const deployer = new ethers.Wallet(PK_DEPLOYER, provider)
    const paramRegistry = new ethers.Contract(deployedData.paramRegistry, ParameterRegistryArtifact.abi, deployer)

    // Generate Parameter ID from name and category
    const categoryBytes32 = ethers.encodeBytes32String(proposalForm.category)
    const parameterId = ethers.keccak256(
      ethers.solidityPacked(["string", "bytes32"], [proposalForm.name, categoryBytes32])
    )

    // Ensure newValue is a number
    const newValueInt = parseInt(proposalForm.newValue, 10)
    if (isNaN(newValueInt)) {
      throw new Error("New Value must be a number")
    }

    const encodedNewValue = ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [newValueInt])

    const tx = await paramRegistry.proposeParameterChange(
      parameterId,
      encodedNewValue,
      proposalForm.description
    )
    await tx.wait()
    
    // Refresh table immediately after creation globally updates
    await fetchProposals();

    message.success('Proposal Created Successfully!')
    isModalVisible.value = false
    // resetForm will automatically be triggered by afterClose
  } catch (err) {
    console.error(err)
    message.error('Failed to create proposal: ' + err.message)
  } finally {
    isCreating.value = false
  }
}

const goToDetail = (id) => {
  router.push(`/proposal/${id}`)
}

const columns = [
  { title: 'PROPOSAL', dataIndex: 'proposal', key: 'proposal', width: '25%' },
  { title: 'STATE', dataIndex: 'state', key: 'state', width: '15%' },
  { title: 'DUE DATE', dataIndex: 'dueDate', key: 'dueDate', width: '20%' },
  { title: 'VOTES FOR', dataIndex: 'votesFor', key: 'votesFor', width: '15%' },
  { title: 'VOTES AGAINST', dataIndex: 'votesAgainst', key: 'votesAgainst', width: '15%' },
  { title: 'TOTAL VOTES', dataIndex: 'totalVotes', key: 'totalVotes', width: '10%' }
];

const data = ref([]);
const isLoadingTable = ref(false);

const STATE_MAPPING = [
  'Pending',
  'Active',
  'Succeeded',
  'Defeated',
  'Executed',
  'Cancelled'
];

const formatVotes = (votesAmount) => {
  const etherVal = Number(ethers.formatEther(votesAmount));
  if (etherVal >= 1000) {
    return (etherVal / 1000).toFixed(1) + 'K';
  }
  return etherVal.toString();
};

const formatDate = (timestamp) => {
  if (Number(timestamp) === 0) return 'TBD';
  const date = new Date(Number(timestamp) * 1000);
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
};

const fetchProposals = async () => {
  isLoadingTable.value = true;
  try {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const paramRegistry = new ethers.Contract(deployedData.paramRegistry, ParameterRegistryArtifact.abi, provider);
    
    let count = await paramRegistry.proposalCount();
    const totalProposals = Number(count);
    
    // Create an array of IDs from totalProposals down to 1
    const proposalIds = Array.from({ length: totalProposals }, (_, i) => totalProposals - i);

    // Fetch all proposals in parallel instead of sequentially
    const fetchPromises = proposalIds.map(async (id) => {
      const [p, details] = await Promise.all([
        paramRegistry.getProposalBasic(id),
        paramRegistry.getProposalDetails(id)
      ]);

      const paramInfo = await paramRegistry.getParameter(p.parameterId);
      const categoryString = ethers.decodeBytes32String(paramInfo.category);
      
      let decodedValue = "Unknown";
      try {
        decodedValue = ethers.AbiCoder.defaultAbiCoder().decode(["uint256"], details.newValue)[0].toString();
      } catch (e) {
        console.error("Failed to decode newValue", e);
      }
        
      const formattedProposal = `Upgrade ${paramInfo.name} to ${decodedValue} for ${categoryString} zone`;
      
      const total = details.forVotes + details.againstVotes;
      
      return {
        key: p.id.toString(),
        proposal: formattedProposal,
        state: STATE_MAPPING[Number(p.state)],
        dueDate: formatDate(details.endTime),
        votesFor: formatVotes(details.forVotes),
        votesAgainst: formatVotes(details.againstVotes),
        totalVotes: formatVotes(total),
      };
    });

    const loadedData = await Promise.all(fetchPromises);
    
    data.value = loadedData;
    paginationConfig.value.total = totalProposals;
  } catch (error) {
    console.error("Failed to load proposals:", error);
    message.error("Failed to load chain data");
  } finally {
    isLoadingTable.value = false;
  }
};

onMounted(() => {
  fetchProposals();
});

const paginationConfig = ref({
  current: 1,
  pageSize: 10,
  total: 15, // Will dynamically update when wired with real data
  showSizeChanger: true,
  pageSizeOptions: ['5', '10', '20', '50'],
  showTotal: (total) => `Total ${total} items`,
  onChange: (page, pageSize) => {
    paginationConfig.value.current = page;
    paginationConfig.value.pageSize = pageSize;
  },
});
</script>

<style>
.custom-create-modal .ant-modal-content {
  border-radius: 12px;
  padding: 0;
}
.custom-create-modal .ant-modal-header {
  border-bottom: 1px solid #f0f0f0;
  padding: 20px 24px;
  border-radius: 12px 12px 0 0;
}
.custom-create-modal .ant-modal-title {
  font-size: 20px;
  font-weight: 600;
}
.custom-create-modal .ant-modal-body {
  padding: 24px;
}
.custom-create-modal .submit-btn {
  background-color: #5544FF;
  border: none;
  height: 48px;
  font-size: 16px;
  border-radius: 6px;
}
.custom-create-modal .submit-btn:hover {
  background-color: #4034db;
}
</style>

<style scoped>
.proposals-container {
  background: #ffffff;
  border-radius: 8px;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
  width: 100%;
  max-width: 1100px;
  overflow: hidden;
}

/* Header border & flex */
.stats-header {
  display: flex;
  border-bottom: 1px solid #f0f0f0;
}
.go-back-section {
  padding: 24px;
  border-right: 1px solid #f0f0f0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 180px;
}
.go-back-btn {
  font-weight: 500;
  font-size: 15px;
  border-radius: 6px;
  color: #1f2937;
  border-color: #d1d5db;
  height: 42px;
  padding: 0 18px;
  display: flex;
  align-items: center;
  gap: 6px;
}

/* Stats Area */
.stat-items {
  display: flex;
  flex: 1;
}
.stat-box {
  flex: 1;
  padding: 24px 16px;
  border-right: 1px solid #f0f0f0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center; /* Center contents */
}
.last-stat {
  border-right: none;
}
.stat-label {
  font-size: 14px;
  color: #6b7280;
  margin-bottom: 12px;
  font-weight: 500;
}
.stat-value {
  font-size: 24px;
  font-weight: 700;
  color: #111827;
  display: flex;
  align-items: center;
  justify-content: center;
}
.proposals-view {
  display: flex;
  align-items: center;
  gap: 12px;
}
.view-btn {
  background: #f3f4f6;
  border: 1px solid #e5e7eb;
  font-size: 13px;
  font-weight: 600;
  color: #374151;
  border-radius: 6px;
  padding: 0 14px;
  height: 28px;
}

/* SVG Voting Power Icon styling */
.a-icon {
  width: 28px;
  height: 28px;
  margin-right: 12px;
  transform: translateY(-2px);
}

/* Filter Bar */
.filter-bar {
  padding: 16px 24px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid #f0f0f0;
}
.search-wrap {
  width: 360px;
}
.search-input {
  border-radius: 6px;
  padding: 8px 12px;
}

.actions-wrap {
  display: flex;
  align-items: center;
  gap: 16px;
}
.select-group {
  display: flex;
  align-items: center;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  padding: 0 8px;
}
.select-label {
  font-size: 14px;
  color: #6b7280;
}
.custom-select {
  width: 140px;
}
:deep(.ant-select-selector) {
  font-weight: 500;
  color: #374151 !important;
}
.split-line {
  height: 24px;
  width: 1px;
  background: #e5e7eb;
  margin: 0 4px;
}
.new-proposal-btn {
  background-color: #3b82f6;
  border-radius: 6px;
  font-weight: 600;
  height: 38px;
  padding: 0 20px;
  box-shadow: none;
}
.new-proposal-btn:hover {
  background-color: #2563eb;
}

/* Table overrides */
:deep(.ant-table-thead > tr > th) {
  background: #fff !important;
  color: #9ca3af !important;
  font-weight: 600;
  font-size: 12px;
  letter-spacing: 0.5px;
  border-bottom: 1px solid #f3f4f6;
}
:deep(.ant-table-tbody > tr > td) {
  padding: 16px 24px;
  font-size: 14px;
  color: #374151;
  font-weight: 500;
  border-bottom: 1px solid #f3f4f6;
}

/* Proposal link icon */
.proposal-title {
  display: flex;
  align-items: center;
  gap: 6px;
}
.link-icon {
  font-size: 12px;
  color: #9ca3af;
  cursor: pointer;
  border: 1px solid #e5e7eb;
  border-radius: 50%;
  padding: 2px;
}

/* Tags */
.state-tag {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 13px;
  font-weight: 600;
  background-color: #fff;
}
.state-tag .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  margin-right: 6px;
}

/* Specific state colors */
.active {
  border: 1px solid #c7d2fe;
  color: #4f46e5;
}
.active .dot { background-color: #4f46e5; }

.succeeded {
  border: 1px solid #bbf7d0;
  color: #16a34a;
}
.succeeded .dot { background-color: #16a34a; }

.executed {
  border: 1px solid #a5f3fc;
  color: #0891b2;
}
.executed .dot { background-color: #0891b2; }

.cancelled {
  border: 1px solid #d1d5db;
  color: #6b7280;
}
.cancelled .dot { background-color: #6b7280; }

.defeated {
  border: 1px solid #fecaca;
  color: #dc2626;
}
.defeated .dot { background-color: #dc2626; }

.pending {
  border: 1px solid #fde68a;
  color: #d97706;
}
.pending .dot { background-color: #d97706; }
:deep(.custom-table-row) {
  cursor: pointer;
  transition: all 0.3s;
}
:deep(.custom-table-row:hover) {
  box-shadow: 0 4px 12px rgba(0,0,0,0.05);
}
:deep(.ant-table-wrapper .ant-pagination) {
  margin: 16px 24px;
}
:deep(.ant-pagination-item-active) {
  border-color: #3b82f6;
}
:deep(.ant-pagination-item-active a) {
  color: #3b82f6;
}
</style>
