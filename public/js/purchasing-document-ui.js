(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else{root.PurchasingDocumentUI=api;const start=()=>api.mountForm(root.document);if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',start,{once:true});else start();}
})(typeof window==='object'?window:globalThis,function(){
  'use strict';
  function tabs(container,cards,prefix,label){
    if(!cards.length||container.querySelector(':scope > [data-purchase-workspace]'))return null;
    const doc=container.ownerDocument,workspace=doc.createElement('section'),nav=doc.createElement('nav');
    workspace.className='gr-detail-tabs-workspace';workspace.dataset.purchaseWorkspace='true';
    nav.className='gr-detail-tabs';nav.setAttribute('role','tablist');nav.setAttribute('aria-label',label);workspace.append(nav);
    const buttons=[];
    function activate(index,focus=false){
      cards.forEach((card,i)=>{card.hidden=i!==index;card.classList.toggle('is-active',i===index);buttons[i].classList.toggle('is-active',i===index);buttons[i].setAttribute('aria-selected',String(i===index));buttons[i].tabIndex=i===index?0:-1;});
      if(focus)buttons[index].focus();
    }
    cards.forEach((card,index)=>{
      const button=doc.createElement('button');button.type='button';button.id=prefix+'-tab-'+index;
      button.textContent=card.dataset.purchaseTab||card.querySelector('h2')?.textContent?.trim()||'Detail '+(index+1);
      // Keep existing IDs, event listeners, inputs and selections intact.
      if(!card.id)card.id=prefix+'-panel-'+index;
      card.classList.add('gr-detail-tab-panel');card.setAttribute('role','tabpanel');card.setAttribute('aria-labelledby',button.id);
      button.setAttribute('role','tab');button.setAttribute('aria-controls',card.id);
      button.addEventListener('click',()=>activate(index));button.addEventListener('keydown',event=>{
        if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
        event.preventDefault();activate(event.key==='Home'?0:event.key==='End'?cards.length-1:(index+(event.key==='ArrowRight'?1:-1)+cards.length)%cards.length,true);
      });
      buttons.push(button);nav.append(button);workspace.append(card);
    });
    container.append(workspace);activate(0);return {activate,cards,buttons};
  }
  function mountDetails(doc){
    const page=doc.querySelector('.purchasing-document-page'),container=page?.querySelector('#ops-detail-collections');
    if(!container)return null;
    page.querySelectorAll('.gr-detail-workflow-actions > small').forEach((hint,index)=>{
      const button=hint.previousElementSibling;
      if(button?.tagName!=='BUTTON')return;
      hint.id='purchase-action-help-'+index;
      hint.classList.add('purchase-workflow-hint');
      button.setAttribute('aria-describedby',hint.id);
      button.title=hint.textContent.trim();
    });
    const cards=[...container.querySelectorAll('.ops-detail-card')].filter(card=>!card.parentElement.closest('.ops-detail-card')&&!card.matches('.mpp-readiness-card'));
    cards.forEach(card=>card.querySelector(':scope > details.ops-related-disclosure')?.setAttribute('open',''));
    // Blockers stay above the tabs, always visible regardless of active content.
    const primary=cards.find(card=>/item|diminta/i.test(card.querySelector('h2')?.textContent||''));
    const ordered=primary?[primary,...cards.filter(card=>card!==primary)]:cards;
    return tabs(container,ordered,'purchase-detail','Detail dokumen purchasing');
  }
  function mountForm(doc){
    const container=doc.querySelector('.purchasing-document-form [data-purchase-form-sections]');if(!container)return null;
    const controller=tabs(container,[...container.querySelectorAll('[data-purchase-tab]')],'purchase-form','Detail formulir purchasing');
    if(!controller)return null;
    const form=container.closest('form');
    form?.addEventListener('invalid',event=>{
      const index=controller.cards.findIndex(card=>card.contains(event.target));if(index>=0)controller.activate(index);
      let node=event.target.parentElement;while(node&&node!==form){if(node.tagName==='DETAILS')node.open=true;node=node.parentElement;}
    },true);
    return controller;
  }
  return {tabs,mountDetails,mountForm};
});
