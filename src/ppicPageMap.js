'use strict';
// Canonical PPIC navigation. Legacy routes remain available for document links.
const groups = [
  {code:'4.1',slug:'preparation',label:'PPIC Plan Lab',query:'tab',tabs:[
    ['readiness','Master Data Readiness'],['workbook','Worksheet Schedule'],['capacity','Detail Capacity Production'],
    ['purchase','Purchase / Request Material Requirement'],['vendor','Vendor Requirement'],['daily','Daily Production Simulation'],
    ['delivery','Delivery Schedule'],['kpi','KPI Simulation']
  ]},
  {code:'4.2',slug:'released',label:'PPIC Released Data',query:'view',tabs:[
    ['monthly','Monthly Production Plan'],['mrp','Material Requirement Plan'],['daily','Daily Production Schedule'],
    ['recovery','Actual Daily Production Condition Recovery'],['delivery','Delivery Customer Planning'],
    ['vendor','Delivery / Incoming Vendor Planning'],['incoming-supplier','Incoming Supplier Planning'],['incoming-material','Incoming Material from Supplier Planning']
  ]},
  {code:'4.3',slug:'control',label:'PPIC Control & Analytic',query:'view',tabs:[
    ['customer','Delivery to Customer Control / Fulfillment Monitoring'],['production','Actual Production Monitoring'],
    ['loading','Loading Ratio'],['supplier','Delivery Supplier Control / Fulfillment Monitoring'],['vendor','Delivery Vendor Control / Fulfillment Monitoring']
  ]}
];
module.exports={groups};
