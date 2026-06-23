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

  async function recordTeacherActivity(name){
    if(!name)return;
    const {error}=await sb.from('teacher_activity').upsert({member_name:name,last_seen:new Date().toISOString()},{onConflict:'member_name'});
    if(error)console.warn('Teacher activity could not be recorded',error);
  }

  window.submitDailyVote=async optionIndex=>{
    const member=teacherMember();
    if(!member){openTeacherPicker();return;}
    document.querySelectorAll('#dash-poll .opt').forEach(button=>button.disabled=true);
    const {error}=await sb.from('daily_votes').insert({
      vote_date:malaysiaDateKey(),
      member_name:member.name,
      question_key:POLL.key,
      option_index:optionIndex
    });
    if(error&&error.code!=='23505')console.warn('Daily vote failed',error);
    await refreshData();
    switchView('dashboard');
  };

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
    const liveBooks=BOOKS.slice();
    const liveByTitle=new Map(liveBooks.map(b=>[b[0],b]));
    const builtinTitles=new Set(BUILTIN_BOOKS.map(b=>b[0]));
    BOOKS=[...BUILTIN_BOOKS.map(b=>{
      const live=liveByTitle.get(b[0]);
      return live?[live[0],live[1]||b[1],live[2]||b[2],live[3]||b[3]||'',live[4]||b[4]||'']:b;
    }),...liveBooks.filter(b=>!builtinTitles.has(b[0]))];
    const liveDiamonds=DIAMONDS.slice();
    const liveKeys=new Set(liveDiamonds.map(d=>`${d.who}|${d.title}|${d.qt}`));
    DIAMONDS=[...liveDiamonds,...BUILTIN_DIAMONDS.filter(d=>!liveKeys.has(`${d.who}|${d.title}|${d.qt}`))];
    const knownBookTitles=new Set(BOOKS.map(b=>b[0]));
    DIAMONDS.forEach(d=>{
      const title=canonicalBookTitle(d.title);
      d.title=title;
      if(title&&!knownBookTitles.has(title)){
        BOOKS.push([title,'','📘']);
        knownBookTitles.add(title);
      }
    });
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
      const newTitle=document.querySelector('#f-new-book-title')?.value.trim()||'';
      const newAuthor=document.querySelector('#f-new-book-author')?.value.trim()||'';
      const newIcon=document.querySelector('#f-new-book-icon')?.value.trim()||'📘';
      const title=newTitle||document.querySelector('#f-book').value.trim();
      const body=document.querySelector('#f-text').value.trim();
      const status=document.querySelector('#diamond-status');
      if(!title){
        const inline=document.querySelector('#new-book-inline');
        const isAdding=inline&&!inline.classList.contains('hidden');
        (isAdding?document.querySelector('#f-new-book-title'):document.querySelector('#f-book')).focus();
        return;
      }
      if(!body){document.querySelector('#f-text').focus();return;}
      button.disabled=true;
      button.textContent='提交中…';
      status.textContent='';
      if(newTitle){
        const {error:bookError}=await sb.from('books').insert({
          title:newTitle,
          author:newAuthor||'作者未标注',
          icon:newIcon
        });
        if(bookError&&bookError.code!=='23505')console.warn('Book insert skipped',bookError);
      }
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
      if(document.querySelector('#f-new-book-title'))document.querySelector('#f-new-book-title').value='';
      if(document.querySelector('#f-new-book-author'))document.querySelector('#f-new-book-author').value='';
      if(document.querySelector('#f-new-book-icon'))document.querySelector('#f-new-book-icon').value='📘';
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
        <button class="mini-btn" id="sync-diamonds">同步历史 Diamond</button>
        <button class="mini-btn" id="recalculate-points">按 Diamond 重算积分</button>
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
          <div class="admin-list">${(books||[]).map(b=>`<div class="admin-row" data-book="${b.id}" data-pdf-path="${esc(b.pdf_path||'')}">
            <input class="adm-book-title" value="${esc(b.title)}"><input class="adm-book-author" value="${esc(b.author||'')}">
            <input class="adm-book-icon" value="${esc(b.icon||'📘')}"><span><button class="mini-btn save-book">保存</button>
            <label class="mini-btn" style="display:inline-block;cursor:pointer">${b.pdf_url?'替换 PDF':'上传 PDF'}<input class="adm-book-pdf" type="file" accept="application/pdf,.pdf" hidden></label>
            ${b.pdf_path?'<button class="mini-btn danger remove-book-pdf">移除 PDF</button>':''} <button class="mini-btn danger delete-book">删除</button></span>
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
    await syncHistoricalDiamonds();
    await recalculatePoints();
    await refreshData();
    switchView('admin');
  }

  async function syncBooks(){
    const payload=BUILTIN_BOOKS.map(b=>({title:b[0],author:b[1]||'',icon:b[2]||'📘'}));
    const {error}=await sb.from('books').upsert(payload,{onConflict:'title'});
    if(error)console.warn('Book sync failed',error);
  }

  function legacyCreatedAt(value){
    const match=String(value||'').match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
    if(!match)return new Date().toISOString();
    return `${match[1]}-${match[2].padStart(2,'0')}-${match[3].padStart(2,'0')}T12:00:00+08:00`;
  }

  function sourceKey(value){
    let hash=2166136261;
    for(let i=0;i<value.length;i++){hash^=value.charCodeAt(i);hash=Math.imul(hash,16777619);}
    return `legacy-${(hash>>>0).toString(16)}`;
  }

  async function syncHistoricalDiamonds(){
    const {data:existing,error:readError}=await sb.from('diamonds').select('author_name,title,body');
    if(readError){console.warn('Historical Diamond check failed',readError);return;}
    const existingKeys=new Set((existing||[]).map(d=>`${d.author_name}|${canonicalBookTitle(d.title)}|${d.body||''}`));
    const payload=BUILTIN_DIAMONDS.filter(d=>!existingKeys.has(`${d.who}|${canonicalBookTitle(d.title)}|${d.qt}`)).map(d=>{
      const title=canonicalBookTitle(d.title);
      return {
        author_name:d.who,
        title,
        body:d.qt,
        avatar:imgFile(d.img||'av-wf1'),
        created_at:legacyCreatedAt(d.time),
        source_key:sourceKey(`${d.who}|${title}|${d.time}|${d.qt}`)
      };
    });
    if(!payload.length)return;
    const {error}=await sb.from('diamonds').upsert(payload,{onConflict:'source_key',ignoreDuplicates:true});
    if(error)console.warn('Historical Diamond sync failed',error);
  }

  async function recalculatePoints(){
    const {error}=await sb.rpc('recalculate_member_points');
    if(error)console.warn('Point recalculation failed',error);
  }

  async function uploadBookPdf(bookRow,file){
    if(!file)return;
    if(file.type!=='application/pdf'&&!file.name.toLowerCase().endsWith('.pdf')){
      alert('只可以上传 PDF 文件。');return;
    }
    const bookId=bookRow.dataset.book;
    const oldPath=bookRow.dataset.pdfPath;
    const path=`book-${bookId}/${Date.now()}.pdf`;
    const {error:uploadError}=await sb.storage.from('book-pdfs').upload(path,file,{contentType:'application/pdf',upsert:false});
    if(uploadError){alert(`PDF 上传失败：${uploadError.message}`);return;}
    const {data:urlData}=sb.storage.from('book-pdfs').getPublicUrl(path);
    const {error:updateError}=await sb.from('books').update({pdf_path:path,pdf_url:urlData.publicUrl}).eq('id',bookId);
    if(updateError){await sb.storage.from('book-pdfs').remove([path]);alert(`书籍更新失败：${updateError.message}`);return;}
    if(oldPath)await sb.storage.from('book-pdfs').remove([oldPath]);
    await refreshData();switchView('admin');
  }

  async function removeBookPdf(bookRow){
    const path=bookRow.dataset.pdfPath;
    if(path)await sb.storage.from('book-pdfs').remove([path]);
    await sb.from('books').update({pdf_path:null,pdf_url:null}).eq('id',bookRow.dataset.book);
  }

  function wireAdminActions(){
    document.querySelector('#admin-refresh').onclick=refreshData;
    document.querySelector('#sync-books').onclick=async()=>{await syncBooks();await refreshData();switchView('admin');};
    document.querySelector('#sync-diamonds').onclick=async()=>{await syncHistoricalDiamonds();await refreshData();switchView('admin');};
    document.querySelector('#recalculate-points').onclick=async()=>{await recalculatePoints();await refreshData();switchView('admin');};
    document.querySelector('#admin-logout').onclick=async()=>{await sb.auth.signOut();await renderAdmin();};
    document.querySelector('#view-admin').onchange=async e=>{
      if(!e.target.classList.contains('adm-book-pdf'))return;
      await uploadBookPdf(e.target.closest('[data-book]'),e.target.files[0]);
    };
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
        const pdfPath=bookRow.dataset.pdfPath;
        if(pdfPath)await sb.storage.from('book-pdfs').remove([pdfPath]);
        await sb.from('books').delete().eq('id',bookRow.dataset.book);
      }else if(e.target.classList.contains('remove-book-pdf')){
        await removeBookPdf(bookRow);
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
    document.querySelector('#teacher-save').onclick=async()=>{
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
      await recordTeacherActivity(member.name);
      await refreshData();
    };
    await refreshData();
    if(!selectedTeacher())openTeacherPicker();
    else{
      await recordTeacherActivity(selectedTeacher());
      await refreshData();
    }
  }

  if(document.readyState==='complete')init();
  else window.addEventListener('load',init,{once:true});
})();
