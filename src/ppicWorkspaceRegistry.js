'use strict';
const definitions = {
  labs: [
    ['L01','planning-home','Planning Home'], ['L02','data-readiness','Data Readiness'],
    ['L03','demand-delivery','Demand & Delivery'], ['L04','mps-gantt','MPS / FG Production Gantt'],
    ['L05','capacity-bottleneck','Capacity & Bottleneck'], ['L06','mrp-material-readiness','MRP & Material Readiness'],
    ['L07','monthly-production-plan','Monthly Production Plan'], ['L08','daily-production-draft','Daily Production Draft'],
    ['L09','scenario-comparison','Scenario Comparison'], ['L10','release-baseline','Release & Baseline'],
  ],
  execution: [
    ['E01','execution-cockpit','Execution Cockpit'], ['E02','dispatch-board','Dispatch Board'],
    ['E03','plan-actual-gantt','Plan vs Actual Gantt'], ['E04','wip-flow','WIP & Flow'],
    ['E05','readiness-shortage','Readiness & Shortage'], ['E06','subcontract-control','Subcontract Control'],
    ['E07','delivery-fulfillment','Delivery Fulfillment'], ['E08','exceptions-recovery','Exceptions & Recovery'],
    ['E09','change-control','Change Control'], ['E10','reconciliation-closure','Reconciliation & Closure'],
  ],
  analytics: [
    ['A01','performance-overview','Performance Overview'], ['A02','customer-service','Customer Service'],
    ['A03','adherence-attainment','Plan Adherence & Attainment'], ['A04','capacity-bottleneck','Capacity & Bottleneck'],
    ['A05','material-inventory','Material & Inventory'], ['A06','supplier-subcontract','Supplier & Subcontract'],
    ['A07','quality-production-loss','Quality & Production Loss'], ['A08','planning-accuracy','Planning Accuracy'],
    ['A09','improvement-actions','Improvement Actions'], ['A10','oee-setup-dies-coil','OEE, Setup & Dies/Coil'],
    ['A11','cost-deviation','Cost of Deviation'],
  ],
};
const domains = [{id:'labs',label:'PPIC Labs',icon:'calendar'},{id:'execution',label:'Execution Control',icon:'file'},{id:'analytics',label:'Analytics',icon:'chart'}];
const pages = domains.flatMap(domain => definitions[domain.id].map(([id,slug,label]) => ({id,slug,label,domain:domain.id,domainLabel:domain.label,href:`/modules/planning-ppic/${domain.id}/${slug}`,implemented:['L01','L02','L03','L04','L05','L06','L07','L08','L09','L10','E01','E02','E03','E04','E05','E06','E07','E08','E09','E10','A01','A02','A03','A04','A05','A06','A07','A08','A09','A10','A11'].includes(id)})));
const filterKeys = ['month','plant','customer','resource','scenario','q','demandType','day','week','status','compare','release','date','shift','location','hold','age','cutoff','basis','owner','action'];
function filters(query = {}, defaultMonth) {
  const value = {};
  for (const key of filterKeys) if (typeof query[key] === 'string' && query[key].length <= 200) value[key] = query[key];
  if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(value.month || '')) value.month = defaultMonth;
  return value;
}
function href(page, values = {}) { const query = new URLSearchParams(Object.entries(values).filter(([key,value]) => filterKeys.includes(key) && value)); return page.href + (query.size ? `?${query}` : ''); }
module.exports = { pages, domains, filterKeys, filters, href, find: (domain, slug) => pages.find(page => page.domain === domain && page.slug === slug) };
