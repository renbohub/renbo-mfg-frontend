(() => {
  'use strict';
  // Preparation uses the same compact stage dock as MPS; other pages are untouched.
  const root = document.querySelector('main.prep-page');
  const navigation = document.querySelector('body > .ppic-workspace-nav');
  if (!root) return;
  root.classList.add('prep-workbench');
  document.body.classList.add('prep-workbench-page');
  if (!navigation || document.querySelector('.ppic-wb-stage-dock')) return;
  const stages = navigation.querySelectorAll('.ppic-nav-stage');
  if (!stages.length) {document.body.style.setProperty('--ppic-wb-dock-height','0px');return;}

  root.classList.add('prep-workbench');
  document.body.classList.add('prep-workbench-page');
  const dock = document.createElement('nav');
  dock.className = 'module-subnav ppic-workspace-nav ppic-wb-stage-dock';
  dock.setAttribute('aria-label', 'Tahapan perencanaan PPIC');
  const links = document.createElement('div');
  links.className = 'app-container module-subnav-inner';
  stages.forEach(link => links.append(link));
  dock.append(links);
  root.after(dock);

  function sizeWorkspace() {
    document.body.style.setProperty('--ppic-wb-dock-height', `${dock.getBoundingClientRect().height}px`);
  }
  sizeWorkspace();
  window.addEventListener('resize', sizeWorkspace);
  if (window.ResizeObserver) new ResizeObserver(sizeWorkspace).observe(dock);
})();
