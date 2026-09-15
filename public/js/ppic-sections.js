(() => {
  'use strict';
  function sync(month) {
    if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month||''))return;
    document.querySelectorAll('[data-ppic-section]').forEach(link=>{
      const url=new URL(link.href,location.href);url.searchParams.set('month',month);link.href=url.pathname+url.search;
    });
  }
  document.addEventListener('change',event=>{
    if(['prep-plan-month','prep-month','release-month','control-month'].includes(event.target?.id))sync(event.target.value);
  });
  window.addEventListener('prep:month-loaded',event=>sync(event.detail?.month));
})();
