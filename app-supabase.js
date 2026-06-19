(function(){
  'use strict';

  const TEACHER_KEY='ocean_teacher_name';
  const ADMIN_EMAILS=['reuss@ocedu.co','penny@ocedu.co'];
  const BUILTIN_BOOKS=BOOKS.map(b=>[...b]);
  const BUILTIN_MEMBERS=MEMBERS.map(m=>({...m}));
  const BUILTIN_DIAMONDS=DIAMONDS.map(d=>({...d}));
  let adminSession=null;

  function appHTML(){
    document.body.insertAdjacentHTML('beforeend',`
      <div class="app-overlay" id="teacher-picker" hidden>
        <div class="glass app-panel">
          <h2>选择你的名字</h2>
          <div class="sub-h">这台浏览器会记住你，下次无需再次选择。</div>
          <div class="field"><label>老师姓名</label><input id="teacher-name" list="teacher-names" autocomplete="off" placeholder="输入或选择你的名字"><datalist id="teacher-names"></datalist></div>
          <button class="btn btn-blue" id="teacher-save" style="width:100%;justify-content:center">开始使用</button>
          <div class="form-status" id="teacher-status"></div>
        </div>
      </div>`);
    if(!document.querySelector('#view-admin')){
      document.querySelector('main').insertAdjacentHTML('beforeend','<section id="view-admin" class="hidden"></section>');
      VIEWS.push(['admin','管理']);
    }
  }

  function selectedTeacher(){return localStorage.getItem(TEACHER_KEY)||'';}

  function teacherMember(name=selectedTeacher()){
    const key=String(name||'').trim().toLowerCase();
    return MEMBERS.find(m=>m.name.toLowerCase()===key)||null;
  }

  function fillTeacherOptions(){
    const input=document.querySelector('#teacher-name');
    const list=document.querySelector('#teacher-names');
    const current=selectedTeacher();
    list.innerHTML=MEMBERS.slice().sort((a,b)=>a.name.localeCompare(b.name)).map(m=>
      `<option value="${esc(m.name)}"></option>`
    ).join('');
    input.value=current;
  }

  function openTeacherPicker(){
    fillTeacherOptions();
    document.querySelector('#teacher-picker').hidden=false;
  }

  function closeTeacherPicker(){document.querySelector('#teacher-picker').hidden=true;}

  function updateTeacherUI(){
    const member=teacherMember();
    if(!member){openTeacherPicker();return;}
    const profile=document.querySelector('.profile');
    if(profile){
      profile.querySelector('.pn').textContent=member.name;
      profile.querySelector('.pl').textContent=`${member.pts||0} 积分`;
      profile.querySelector('#me-av').innerHTML=`<img src="${asset(member.img||'av-wf1')}" alt="">`;
      profile.onclick=openTeacherPicker;
      profile.title='更换老师';
    }
    const nameInput=document.querySelector('#f-name');
    if(nameInput){nameInput.value=member.name;nameInput.readOnly=true;}
  }

  async function refreshData(){
    await loadFromSupabase();
    if(MEMBERS.length<BUILTIN_MEMBERS.length){
      const liveByName=new Map(MEMBERS.map(m=>[m.name,m]));
      MEMBERS=BUILTIN_MEMBERS.map(m=>liveByName.get(m.name)||m);
      MEMBERS.sort((a,b)=>b.pts-a.pts);
    }
    if(BOOKS.length<10){
      const liveByTitle=new Map(BOOKS.map(b=>[b[0],b]));
      BOOKS=BUILTIN_BOOKS.map(b=>liveByTitle.get(b[0])||b);
    }
    const liveDiamonds=DIAMONDS.slice();
    const liveKeys=new Set(liveDiamonds.map(d=>`${d.who}|${d.title}|${d.qt}`));
    DIAMONDS=[...liveDiamonds,...BUILTIN_DIAMONDS.filter(d=>!liveKeys.has(`${d.who}|${d.title}|${d.qt}`))];
    renderChrome();
    renderAll();
    updateTeacherUI();
    wireDiamondSubmit();
    await renderAdmin();
  }

  function wireDiamondSubmit(){
    const button=document.querySelector('#f-submit');
    if(!button)return;
    const form=button.closest('.glass');
    if(form&&!form.querySelector('.form-status'))button.insertAdjacentHTML('afterend','<div class="form-status" id="diamond-status"></div>');
    button.onclick=async()=>{
      const member=teacherMember();
      if(!member){openTeacherPicker();return;}
      const title=document.querySelector('#f-book').value.trim();
      const body=document.querySelector('#f-text').value.trim();
      const status=document.querySelector('#diamond-status');
      if(!title){document.querySelector('#f-book').focus();return;}
      if(!body){document.querySelector('#f-text').focus();return;}
      button.disabled=true;
      button.textContent='提交中…';
      status.textContent='';
      const {error}=await sb.from('diamonds').insert({
        author_name:member.name,
        title,
        body,
        avatar:imgFile(member.img||'av-wf1')
      });
      if(error){
        status.style.color='#ff9caf';
        status.textContent=`提交失败：${error.message}`;
        button.disabled=false;
        button.textContent='💎 提交 DIAMOND';
        return;
      }
      status.style.color='var(--teal)';
      status.textContent='提交成功，已增加 1 积分。';
      document.querySelector('#f-book').value='';
      document.querySelector('#f-text').value='';
      button.disabled=false;
      button.textContent='💎 提交 DIAMOND';
      await refreshData();
      switchView('dashboard');
    };
  }

  function isAdminEmail(email){return ADMIN_EMAILS.includes(String(email||'').toLowerCase());}

  async function renderAdmin(){
    const view=document.querySelector('#view-admin');
    if(!view)return;
    const {data}=await sb.auth.getSession();
    adminSession=data.session;
    if(!adminSession||!isAdminEmail(adminSession.user.email)){
      view.innerHTML=`
        <h2 class="view-h">管理后台</h2>
        <div class="sub-h">仅限 Reuss 与 Penny。</div>
        <div class="glass" style="padding:22px;max-width:520px">
          <div class="field"><label>管理员</label><select id="admin-email">
            <option value="reuss@ocedu.co">Reuss</option><option value="penny@ocedu.co">Penny</option>
          </select></div>
          <div class="field"><label>密码</label><input id="admin-password" type="password" autocomplete="current-password"></div>
          <button class="btn btn-blue" id="admin-login" style="width:100%;justify-content:center">登录</button>
          <div class="form-status" id="admin-status"></div>
        </div>`;
      document.querySelector('#admin-login').onclick=adminLogin;
      return;
    }

    const [{data:members},{data:books},{data:diamonds}]=await Promise.all([
      sb.from('members').select('*').order('name'),
      sb.from('books').select('*').order('title'),
      sb.from('diamonds').select('*').order('created_at',{ascending:false}).limit(100)
    ]);
    view.innerHTML=`
      <h2 class="view-h">管理后台</h2>
      <div class="sub-h">${esc(adminSession.user.email)} · 内容与积分管理</div>
      <div style="display:flex;gap:8px;margin-bottom:18px;flex-wrap:wrap">
        <button class="mini-btn" id="admin-refresh">刷新数据</button>
        <button class="mini-btn" id="sync-books">同步当前书库</button>
        <button class="mini-btn danger" id="admin-logout">退出登录</button>
      </div>
      <div class="admin-grid">
        <div class="glass" style="padding:18px"><div class="sec-h">成员积分与角色</div>
          <div class="admin-list">${(members||[]).map(m=>`<div class="admin-row" data-member="${m.id}">
            <strong>${esc(m.name)}</strong><input class="adm-points" type="number" min="0" value="${m.points||0}">
            <input class="adm-role" value="${esc(m.role||'')}" placeholder="角色"><button class="mini-btn save-member">保存</button>
          </div>`).join('')}</div>
        </div>
        <div class="glass" style="padding:18px"><div class="sec-h">书库</div>
          <div style="display:grid;grid-template-columns:1fr 1fr 80px auto;gap:8px;margin-bottom:12px">
            <input class="search" id="new-book-title" placeholder="书名"><input class="search" id="new-book-author" placeholder="作者">
            <input class="search" id="new-book-icon" value="📘"><button class="mini-btn" id="add-book">新增</button>
          </div>
          <div class="admin-list">${(books||[]).map(b=>`<div class="admin-row" data-book="${b.id}">
            <input class="adm-book-title" value="${esc(b.title)}"><input class="adm-book-author" value="${esc(b.author||'')}">
            <input class="adm-book-icon" value="${esc(b.icon||'📘')}"><span><button class="mini-btn save-book">保存</button> <button class="mini-btn danger delete-book">删除</button></span>
          </div>`).join('')}</div>
        </div>
        <div class="glass" style="padding:18px"><div class="sec-h">Diamond 记录</div>
          <div class="admin-list">${(diamonds||[]).map(d=>`<div class="admin-row" data-diamond="${d.id}" style="grid-template-columns:110px 1fr 130px auto">
            <strong>${esc(d.author_name)}</strong><span>${esc(d.title)}</span><small>${fmtTime(d.created_at)}</small>
            <button class="mini-btn danger delete-diamond">删除</button>
          </div>`).join('')}</div>
        </div>
      </div>`;
    wireAdminActions();
  }

  async function adminLogin(){
    const email=document.querySelector('#admin-email').value;
    const password=document.querySelector('#admin-password').value;
    const status=document.querySelector('#admin-status');
    const {error}=await sb.auth.signInWithPassword({email,password});
    if(error){status.style.color='#ff9caf';status.textContent='登录失败，请检查密码或确认账号已建立。';return;}
    status.textContent='登录成功。';
    await syncBooks();
    await refreshData();
    switchView('admin');
  }

  async function syncBooks(){
    const payload=BUILTIN_BOOKS.map(b=>({title:b[0],author:b[1]||'',icon:b[2]||'📘'}));
    const {error}=await sb.from('books').upsert(payload,{onConflict:'title'});
    if(error)console.warn('Book sync failed',error);
  }

  function wireAdminActions(){
    document.querySelector('#admin-refresh').onclick=refreshData;
    document.querySelector('#sync-books').onclick=async()=>{await syncBooks();await refreshData();switchView('admin');};
    document.querySelector('#admin-logout').onclick=async()=>{await sb.auth.signOut();await renderAdmin();};
    document.querySelector('#add-book').onclick=async()=>{
      const title=document.querySelector('#new-book-title').value.trim();
      if(!title)return;
      await sb.from('books').insert({title,author:document.querySelector('#new-book-author').value.trim(),icon:document.querySelector('#new-book-icon').value.trim()||'📘'});
      await refreshData();switchView('admin');
    };
    document.querySelector('#view-admin').onclick=async e=>{
      const memberRow=e.target.closest('[data-member]');
      const bookRow=e.target.closest('[data-book]');
      const diamondRow=e.target.closest('[data-diamond]');
      if(e.target.classList.contains('save-member')){
        await sb.from('members').update({points:Number(memberRow.querySelector('.adm-points').value)||0,role:memberRow.querySelector('.adm-role').value.trim()}).eq('id',memberRow.dataset.member);
      }else if(e.target.classList.contains('save-book')){
        await sb.from('books').update({title:bookRow.querySelector('.adm-book-title').value.trim(),author:bookRow.querySelector('.adm-book-author').value.trim(),icon:bookRow.querySelector('.adm-book-icon').value.trim()||'📘'}).eq('id',bookRow.dataset.book);
      }else if(e.target.classList.contains('delete-book')){
        await sb.from('books').delete().eq('id',bookRow.dataset.book);
      }else if(e.target.classList.contains('delete-diamond')){
        await sb.from('diamonds').delete().eq('id',diamondRow.dataset.diamond);
      }else{return;}
      await refreshData();switchView('admin');
    };
  }

  async function init(){
    if(!window.supabase||!sb)return;
    appHTML();
    renderChrome();
    document.querySelector('#teacher-save').onclick=()=>{
      const input=document.querySelector('#teacher-name');
      const status=document.querySelector('#teacher-status');
      const member=teacherMember(input.value);
      if(!member){
        status.style.color='#ff9caf';
        status.textContent='找不到这个名字，请从 28 位成员名单中选择。';
        input.focus();
        return;
      }
      localStorage.setItem(TEACHER_KEY,member.name);
      status.textContent='';
      closeTeacherPicker();
      updateTeacherUI();
      wireDiamondSubmit();
    };
    await refreshData();
    if(!selectedTeacher())openTeacherPicker();
  }

  if(document.readyState==='complete')init();
  else window.addEventListener('load',init,{once:true});
})();
