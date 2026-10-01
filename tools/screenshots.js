/*
 * Käyttöohjeen kuvakaappausten uusinta (assets/ohjeet/*.jpg).
 *
 * Vaatii: Node.js + Playwright (npm i playwright) ja käynnissä olevan BarShiftin, jossa on DEMODATA (db/seed_demo.sql).
 * Käyttö:  BARSHIFT_URL=http://127.0.0.1:8080/ node tools/screenshots.js
 * Valinnaiset ympäristömuuttujat:
 *   CHROMIUM_PATH  selaimen polku (oletus: Playwrightin oma)
 *   ICONS_DIR      paikallinen bootstrap-icons/font-hakemisto, jos selain ei pääse CDN:ään
 *   NO_MAP_TILES   jos asetettu, kartan laatat korvataan yksinkertaisella kuvalla
 * Demodatan salasana on README:ssä. Kuvat sisältävät vain esimerkkidataa.
 */
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path');
const OUT = path.join(__dirname, '..', 'assets', 'ohjeet') + path.sep;
const BASE = (process.env.BARSHIFT_URL || 'http://127.0.0.1:8080/').replace(/\/?$/, '/');
const ICONS = process.env.ICONS_DIR || '';
const TILE = '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#ece8de"/><path d="M0 64 L256 190" stroke="#faf7f0" stroke-width="9"/><path d="M60 0 L190 256" stroke="#faf7f0" stroke-width="7"/><path d="M0 128H256M128 0V256" stroke="#e1dcd0" stroke-width="2"/><rect x="150" y="20" width="80" height="50" fill="#d6e8ce"/><rect x="20" y="170" width="70" height="60" fill="#d9e6ee"/></svg>';
const ct={'.css':'text/css','.woff2':'font/woff2','.woff':'font/woff'};
async function ctxFor(b,vp){
  const ctx=await b.newContext({viewport:vp,deviceScaleFactor:1});
  if (ICONS) await ctx.route('https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.1/font/**',r=>{const u=new URL(r.request().url()); const f=path.join(ICONS,u.pathname.replace('/npm/bootstrap-icons@1.11.1/font/','')); fs.existsSync(f)?r.fulfill({status:200,contentType:ct[path.extname(f)]||'application/octet-stream',body:fs.readFileSync(f)}):r.fulfill({status:404,body:''});});
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/,r=>r.fulfill({status:200,contentType:'text/css',body:''}));
  if (process.env.NO_MAP_TILES) await ctx.route('https://tile.openstreetmap.org/**',r=>r.fulfill({status:200,contentType:'image/svg+xml',body:TILE}));
  return ctx;
}
const shot=async(p,name,clip)=>{await p.waitForTimeout(350); await p.screenshot({path:OUT+name+'.jpg',type:'jpeg',quality:82,...(clip?{clip}:{})}); console.log('ok',name);};
const shotEl=async(p,name,sel)=>{await p.waitForTimeout(350); const el=await p.$(sel); await el.scrollIntoViewIfNeeded(); await el.screenshot({path:OUT+name+'.jpg',type:'jpeg',quality:82}); console.log('ok',name);};
const post=(p,action,body)=>p.evaluate(([a,b])=>fetch('api.php?action='+a,{method:'POST',body:JSON.stringify(b)}).then(r=>r.json()),[action,body]);
async function login(p,u){await p.goto(BASE+'index.php');await p.fill('#li-u',u);await p.fill('#li-p','DemoBaari2026!');await p.click('text=Kirjaudu sisään');await p.waitForTimeout(1600);}
(async()=>{
 const b=await chromium.launch(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{});
 // --- kirjautuminen
 let ctx=await ctxFor(b,{width:1280,height:720}); let p=await ctx.newPage();
 await p.goto(BASE+'index.php'); await p.waitForSelector('#li-u'); await p.fill('#li-u','mikko@demobaari'); await shot(p,'kirjautuminen',{x:340,y:70,width:600,height:580}); await ctx.close();
 // --- admin, työpöytä
 ctx=await ctxFor(b,{width:1280,height:880}); p=await ctx.newPage(); await login(p,'admin@demobaari');
 await shot(p,'koti-admin');
 await p.evaluate(()=>toggleDash('abs',true)); await p.evaluate(()=>window.scrollTo(0,0)); 
 await p.evaluate(()=>nav('calendar')); await shot(p,'kalenteri');
 await p.evaluate(()=>{nav('list'); setShiftTab('week')}); await shot(p,'vuorot-viikko');
 await p.evaluate(()=>setShiftTab('list')); await shot(p,'vuorot-lista');
 await p.evaluate(()=>{nav('events')}); await shot(p,'tapahtumat');
 await p.evaluate(()=>openEventModal()); await shot(p,'tapahtuma-lomake'); await p.evaluate(()=>closeModal());
 await p.evaluate(()=>{nav('absences'); setAbsFilter('pending')}); await shot(p,'poissaolot-admin');
 const vid=await p.evaluate(()=>state.data.absences.find(a=>a.type==='vacation'&&a.status==='pending'&&a.user_id==9002).id);
 await p.evaluate(i=>decideAbsence(i,'approved'),vid); await shot(p,'poissaolo-hyvaksynta'); await p.evaluate(()=>closeModal());
 await p.evaluate(()=>{nav('admin'); setAdminTab('users')}); await shot(p,'hallinta-tyontekijat');
 await p.evaluate(()=>openUserModal(9006)); await shot(p,'tyontekija-lomake'); await p.evaluate(()=>closeModal());
 await p.evaluate(()=>setAdminTab('profile')); await p.waitForSelector('#pp-name'); await p.evaluate(()=>window.scrollTo(0,0)); await shot(p,'julkinen-profiili');
 await p.evaluate(()=>setAdminTab('notices')); await shot(p,'hallinta-ilmoitustaulu');
 // --- uudet ominaisuudet (admin)
 await p.setViewportSize({width:1280,height:1250});
 await p.evaluate(()=>{nav('admin'); setAdminTab('pub')}); await p.waitForSelector('#ps-name'); await p.evaluate(()=>window.scrollTo(0,0)); await shotEl(p,'hallinta-baari','.card-sm');
 await p.evaluate(()=>setAdminTab('audit')); await p.waitForSelector('.bs-table'); await shot(p,'auditloki',{x:260,y:0,width:1020,height:520});
 await p.evaluate(()=>{state.reportFrom='2026-08'; nav('stats')}); await p.evaluate(()=>{const d=new Date(); state.reportFrom=new Date(d.getFullYear(),d.getMonth()-1,1).toISOString().slice(0,7); state.reportTo=d.toISOString().slice(0,7); render()});
 await p.click('text=Näytä'); await p.waitForSelector('#report-print table'); await shotEl(p,'raportti','.card-sm >> nth=1');
 await p.evaluate(()=>{state.absView='calendar'; nav('absences')}); await p.waitForSelector('.ac-table'); await shotEl(p,'poissaolokalenteri','.card-sm');
 await post(p,'shift_template',{name:'Ilta 16–02',start:'16:00',end:'02:00',role:'Baarimestari'}); await post(p,'shift_template',{name:'Päivä 10–16',start:'10:00',end:'16:00',role:'Tarjoilija'}); await p.evaluate(()=>load()); await p.waitForTimeout(900);
 const sh=await p.evaluate(()=>{const t=new Date().toISOString().slice(0,10); const s=state.data.shifts.find(x=>x.userId&&x.date>=t); return s});
 await p.evaluate(s=>{nav('list'); openShiftModal(null,s.userId,s.date)},sh); await p.waitForSelector('#m-warn .warn-box'); await p.waitForTimeout(400); await shotEl(p,'vuoro-lomake','#modal-box');
 await p.evaluate(()=>closeModal());
 await p.evaluate(()=>{nav('admin'); setAdminTab('profile')}); await p.waitForSelector('#sh-ical'); await shotEl(p,'jaa-ja-upota','.card-sm >> nth=1');
  const inv=await post(p,'send_invite',{userId:9006}); const wp=await ctx.newPage(); await wp.setViewportSize({width:480,height:560}); await wp.goto(inv.invite.link); await wp.waitForSelector('.login-id'); await shot(wp,'salasanan-asetus'); await wp.close();
 const wg=await ctx.newPage(); await wg.setViewportSize({width:400,height:560}); await wg.goto(BASE+'widget.html?n=4'); await wg.waitForSelector('.ev'); await shot(wg,'widget'); await wg.close();
 await p.setViewportSize({width:1280,height:880});
 // --- toinen aalto: miehitys, tiimi, analytiikka, varaukset
 await post(p,'staffing_rule',{dow:4,start:'20:00',end:'02:00',min_staff:4}); await post(p,'staffing_rule',{dow:5,start:'20:00',end:'02:00',min_staff:4}); await p.evaluate(()=>load()); await p.waitForTimeout(900);
 await p.evaluate(()=>{nav('admin'); setAdminTab('coverage')}); await p.waitForSelector('text=Kattavuus'); await p.evaluate(()=>window.scrollTo(0,0)); await shot(p,'hallinta-miehitys');
 await p.evaluate(()=>{nav('admin'); setAdminTab('analytics')}); await p.waitForSelector('text=Täsmällisyys'); await shot(p,'analytiikka');
 const mates=await p.evaluate(()=>state.data.users.filter(u=>u.id!=state.user.id).map(u=>u.id));
 await post(p,'kudos',{to_user_id:mates[0],message:'Kiitos, että pelastit perjantain!'}); await post(p,'checklist',{name:'Uuden työntekijän perehdytys',items:['Hätäpoistumisreitit','Kassajärjestelmä','Anniskelulain kertaus','Avaus- ja sulkemisrutiinit']}); await post(p,'survey',{question:'Kuinka tyytyväinen olet työvuoroihisi?'}); await p.evaluate(()=>load()); await p.waitForTimeout(900);
 const cl=await p.evaluate(()=>state.data.checklists[0].id); await post(p,'assign_checklist',{checklistId:cl,userId:mates[1]}); await p.evaluate(()=>load()); await p.waitForTimeout(900);
 await p.evaluate(()=>{setTeamTab('kudos'); nav('team')}); await shot(p,'tiimi-kiitokset');
 await p.evaluate(()=>{setTeamTab('onboarding'); nav('team')}); await shot(p,'tiimi-perehdytys');
 await p.evaluate(async()=>{const s=state.data.pub; const hours=[0,1,2,3,4,5,6].map(d=>({dow:d,open:'16:00',close:'23:00'})); await fetch('api.php?action=save_pub_settings',{method:'POST',body:JSON.stringify({...s,feature_bookings:true,feature_tickets:true,booking:{...s.booking,hours,auto_confirm:false}})});});
  const bd=new Date(Date.now()+3*864e5).toISOString().slice(0,10);
 for (const [n,pt,t] of [['Aino Virtanen',4,'18:00'],['Petri Laine',2,'19:00'],['Sanna Koski',6,'20:00']]) await p.evaluate(async([_x,n,pt,bd,t])=>{await fetch('api.php?action=public_book',{method:'POST',body:JSON.stringify({name:n,email:n.split(' ')[0].toLowerCase()+'@example.test',party:pt,date:bd,time:t})})},[pid2,n,pt,bd,t]);
 await p.evaluate(()=>load()); await p.waitForTimeout(900);
 await p.evaluate(()=>{nav('admin'); setAdminTab('bookings')}); await p.waitForSelector('text=Kirjaa varaus'); await shot(p,'hallinta-varaukset');
 await p.evaluate(()=>{nav('messages')}); await shot(p,'viestit');
 await ctx.close();
 // --- työntekijä
 ctx=await ctxFor(b,{width:1280,height:880}); p=await ctx.newPage(); await login(p,'mikko@demobaari');
 await p.evaluate(()=>nav('profile')); await shot(p,'profiili');
 await p.setViewportSize({width:1280,height:1400}); await p.evaluate(()=>{nav('profile'); setProfileTab('security'); beginTotp()}); await p.waitForSelector('#totp-code'); await shotEl(p,'profiili-2fa','.card-sm >> nth=0'); await p.setViewportSize({width:1280,height:880});
 await p.evaluate(()=>nav('absences')); await shot(p,'poissaolot-tyontekija');
 await ctx.close();
 ctx=await ctxFor(b,{width:390,height:844}); p=await ctx.newPage(); await login(p,'sari@demobaari'); await shot(p,'mobiili-koti');
 await p.evaluate(()=>{nav('list'); setShiftTab('list')}); await shot(p,'mobiili-vuorot'); await ctx.close();
 // --- julkinen kalenteri
 ctx=await ctxFor(b,{width:1280,height:900}); p=await ctx.newPage();
 await p.goto(BASE+'tapahtumat.html'); await p.waitForSelector('.tile'); await shot(p,'tapahtumakalenteri-lista');
 await p.click('.tab[data-view=month]'); await p.waitForSelector('.day'); await shot(p,'tapahtumakalenteri-kuukausi');
 console.log('ok tapahtumakalenteri-kartta');
 await p.click('.tab[data-view=list]'); await p.click('.tile'); await shot(p,'tapahtumakalenteri-tapahtuma'); await ctx.close();
 await b.close();
})().catch(e=>{console.error('VIRHE',e.message);process.exit(1)});
