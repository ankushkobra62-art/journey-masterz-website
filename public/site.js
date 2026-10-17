document.addEventListener('DOMContentLoaded',()=>{
  const toggle=document.querySelector('[data-menu-toggle]'),nav=document.querySelector('[data-nav]');
  if(toggle&&nav)toggle.addEventListener('click',()=>{const open=nav.classList.toggle('is-open');toggle.setAttribute('aria-expanded',String(open));toggle.textContent=open?'×':'☰';});
  document.querySelectorAll('form').forEach(form=>{
    form.addEventListener('submit',e=>{
      if(form.querySelector('[name="phone"]')){
        const phone=form.querySelector('[name="phone"]');
        if(phone&&!phone.value.trim()){e.preventDefault();phone.focus();}
      }
    });
  });
});
