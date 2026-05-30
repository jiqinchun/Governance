import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    redirect: '/proposals'
  },
  {
    path: '/proposals',
    name: 'Proposals',
    component: () => import('../views/Proposals.vue')
  },
  {
    path: '/proposal/:id',
    name: 'ProposalDetail',
    component: () => import('../views/ProposalDetail.vue')
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router
