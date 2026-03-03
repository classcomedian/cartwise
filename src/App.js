import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

// ─── SUPABASE ─────────────────────────────────────────────────────────────────
const SUPABASE_URL = "https://ovridftegqclpajzxjho.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im92cmlkZnRlZ3FjbHBhanp4amhvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI0ODEzMTcsImV4cCI6MjA4ODA1NzMxN30.sGzRPI481Kcdkcu7P94aPT6Ihno6bkTQaVZaP_jz9IE";
const sb = createClient(SUPABASE_URL, SUPABASE_ANON);
const ANTHROPIC_KEY = process.env.REACT_APP_ANTHROPIC_KEY;

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const STORES = [
  { id:"walmart",    name:"Walmart",      logo:"🛒", instacart:"walmart" },
  { id:"target",     name:"Target",       logo:"🎯", instacart:"target" },
  { id:"kroger",     name:"Kroger",       logo:"🏪", instacart:"kroger" },
  { id:"aldi",       name:"Aldi",         logo:"🛍️", instacart:"aldi" },
  { id:"costco",     name:"Costco",       logo:"📦", instacart:"costco" },
  { id:"wholefoods", name:"Whole Foods",  logo:"🌿", instacart:"whole-foods" },
  { id:"traderjoes", name:"Trader Joe's", logo:"🌺", instacart:"trader-joes" },
  { id:"meijer",     name:"Meijer",       logo:"🏬", instacart:"meijer" },
];
const FRUGAL = [
  {value:1,label:"Treat Yourself", desc:"Keep brands, minimal cuts",   emoji:"🛍️"},
  {value:2,label:"Balanced",       desc:"Smart swaps where it matters", emoji:"⚖️"},
  {value:3,label:"Budget Mode",    desc:"Generic everything possible",  emoji:"💰"},
  {value:4,label:"Survival Mode",  desc:"Needs only, bare minimum",     emoji:"🧱"},
];
const HH_TYPES = [
  {id:"solo",   label:"Just Me",       emoji:"🧑",  desc:"Single adult"},
  {id:"couple", label:"Two Adults",    emoji:"👫",  desc:"Two people"},
  {id:"family", label:"Family",        emoji:"👨‍👩‍👧‍👦", desc:"Kids included"},
  {id:"bigfam", label:"Big Household", emoji:"🏠",  desc:"5+ people"},
];
const SCHEDULES = [
  {id:"weekly",   label:"Every week",    emoji:"📅", desc:"Best for families"},
  {id:"biweekly", label:"Every 2 weeks", emoji:"🗓️", desc:"Most popular"},
  {id:"monthly",  label:"Once a month",  emoji:"📆", desc:"Stock-up runs"},
];
const PRI = {
  high:   {color:"#c0392b", label:"Must Have"},
  medium: {color:"#d4a843", label:"Want"},
  low:    {color:"#8a7060", label:"Nice to Have"},
};
const CAT_EMOJI = {
  produce:"🥦",dairy:"🥛",meat:"🥩",pantry:"🥫",
  frozen:"🧊",bakery:"🍞",beverages:"🧃",household:"🧹",other:"🛒",
};
const TIPS = [
  "Generic brands save the average family $1,200/year.",
  "Buying in bulk cuts per-unit cost by up to 40%.",
  "Shopping with a list reduces impulse spending by 23%.",
  "Frozen vegetables are just as nutritious — and cost half as much.",
  "Meal planning before shopping cuts food waste by 30%.",
];

function hhLabel(n){ if(!n)return"Your Household"; const t=n.trim(); return t.endsWith("s")?`The ${t}' Household`:`The ${t} Household`; }
function storeName(id){ return STORES.find(s=>s.id===id)?.name||id; }
function storeObj(id){ return STORES.find(s=>s.id===id)||STORES[0]; }
function fmt(n){ return Number(n||0).toFixed(2); }
function orderId(){ return "CW-"+Date.now().toString(36).toUpperCase().slice(-6); }
function randomTip(){ return TIPS[Math.floor(Math.random()*TIPS.length)]; }

// ─── DB HELPERS ───────────────────────────────────────────────────────────────
async function getProfile(userId){
  const {data} = await sb.from("profiles").select("*").eq("id",userId).single();
  return data;
}
async function upsertProfile(userId, fields){
  await sb.from("profiles").upsert({id:userId, ...fields}, {onConflict:"id"});
}
async function getOrders(userId){
  const {data} = await sb.from("orders").select("*").eq("user_id",userId).order("created_at",{ascending:false}).limit(20);
  return data||[];
}
async function insertOrder(userId, trip){
  await sb.from("orders").insert({user_id:userId, ...trip});
}

// ─── AI ───────────────────────────────────────────────────────────────────────
async function callAI(system, user){
  const res = await fetch("https://api.anthropic.com/v1/messages",{
    method:"POST",
    headers:{"Content-Type":"application/json","anthropic-version":"2023-06-01","x-api-key":ANTHROPIC_KEY,"anthropic-dangerous-direct-browser-access":"true"},
    body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:1200,system,messages:[{role:"user",content:user}]}),
  });
  const raw=await res.text();
  let env; try{env=JSON.parse(raw);}catch{throw new Error("Bad server response. Try again.");}
  if(!res.ok) throw new Error("AI error: "+(env.error?.message||"Try again."));
  const text=env.content?.find(b=>b.type==="text")?.text||"";
  const s=text.indexOf("{"),e=text.lastIndexOf("}");
  if(s===-1||e===-1) throw new Error("Unexpected AI response. Try again.");
  try{return JSON.parse(text.slice(s,e+1));}catch{throw new Error("Could not read AI response. Try again.");}
}

const FONTS=`@import url('https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,600;0,700;1,400&family=Caveat:wght@400;600;700&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600&display=swap');`;

// ─── ROOT ─────────────────────────────────────────────────────────────────────
export default function App(){
  const [session,setSession]=useState(undefined); // undefined=loading, null=logged out
  const [profile,setProfile]=useState(null);
  const [screen,setScreen]=useState("login");
  const [cart,setCart]=useState(null);
  const [authLoading,setAuthLoading]=useState(true);

  // Listen for Supabase auth changes
  useEffect(()=>{
    sb.auth.getSession().then(({data:{session}})=>{
      setSession(session);
      if(session) loadProfile(session.user.id);
      else setAuthLoading(false);
    });
    const {data:{subscription}} = sb.auth.onAuthStateChange((_event,session)=>{
      setSession(session);
      if(session) loadProfile(session.user.id);
      else { setProfile(null); setScreen("login"); setAuthLoading(false); }
    });
    return ()=>subscription.unsubscribe();
  },[]);

  const loadProfile = async(userId)=>{
    const p = await getProfile(userId);
    if(p){ setProfile(p); setScreen(p.hh_type?"home":"onboard"); }
    else setScreen("onboard");
    setAuthLoading(false);
  };

  const updateProfile = async(fields)=>{
    const updated = {...profile,...fields};
    setProfile(updated);
    if(session) await upsertProfile(session.user.id, fields);
  };

  const login = async(email,pass)=>{
    const {error} = await sb.auth.signInWithPassword({email,password:pass});
    if(error) return error.message==="Invalid login credentials"?"Incorrect email or password.":error.message;
    return null;
  };

  const signup = async(email,pass,name)=>{
    const {data,error} = await sb.auth.signUp({email,password:pass});
    if(error) return error.message;
    if(data.user){
      await upsertProfile(data.user.id,{
        name, email, store:"walmart", budget:150, frugal:2,
        hh_type:"", is_paid:false, schedule:null,
        joined_date: new Date().toISOString().slice(0,7),
      });
    }
    return null;
  };

  const logout = async()=>{
    await sb.auth.signOut();
    setProfile(null);
    setScreen("login");
  };

  const go=(s,data)=>{
    if(data?.cart) setCart(data.cart);
    setScreen(s);
  };

  // Loading splash
  if(authLoading) return(
    <>
      <style>{FONTS}{CSS}</style>
      <div className="screen" style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:"100vh"}}>
        <div style={{textAlign:"center"}}>
          <div className="logo-xl">cart<span>wise</span></div>
          <div style={{marginTop:16}}><span className="spin" style={{width:20,height:20,borderWidth:3}}/></div>
        </div>
      </div>
    </>
  );

  // Derive history from orders loaded separately — pass loadOrders helper
  const loadOrders = ()=> session ? getOrders(session.user.id) : Promise.resolve([]);
  const saveOrder  = (trip)=> session ? insertOrder(session.user.id,trip) : Promise.resolve();

  return(<>
    <style>{FONTS}{CSS}</style>
    {screen==="login"    && <Login    onLogin={login}    onSignup={()=>setScreen("signup")} />}
    {screen==="signup"   && <Signup   onSignup={signup}  onBack={()=>setScreen("login")} />}
    {screen==="onboard"  && <Onboard  profile={profile}  onDone={async f=>{await updateProfile(f);setScreen("home");}} />}
    {screen==="home"     && <Home     profile={profile}  go={go} onLogout={logout} loadOrders={loadOrders} />}
    {screen==="optimize" && <Optimizer profile={profile} updateProfile={updateProfile} go={go} onBack={()=>setScreen("home")} />}
    {screen==="autorun"  && <AutoRun  profile={profile}  updateProfile={updateProfile} go={go} onBack={()=>setScreen("home")} />}
    {screen==="checkout" && <Checkout profile={profile}  cart={cart} saveOrder={saveOrder} onBack={()=>setScreen("home")} />}
    {screen==="schedule" && <Schedule profile={profile}  updateProfile={updateProfile} onBack={()=>setScreen("home")} />}
    {screen==="upgrade"  && <Upgrade  profile={profile}  onUpgrade={async()=>{await updateProfile({is_paid:true});setScreen("home");}} onBack={()=>setScreen("home")} />}
    {screen==="history"  && <History  loadOrders={loadOrders} onBack={()=>setScreen("home")} />}
    {screen==="settings" && <Settings profile={profile}  updateProfile={updateProfile} onBack={()=>setScreen("home")} onLogout={logout} />}
  </>);
}

// ─── LOGIN ────────────────────────────────────────────────────────────────────
function Login({onLogin,onSignup}){
  const [email,setEmail]=useState("");
  const [pass,setPass]=useState("");
  const [err,setErr]=useState("");
  const [busy,setBusy]=useState(false);
  const [showPass,setShowPass]=useState(false);
  const go=async()=>{
    if(!email||!pass){setErr("Please fill in both fields.");return;}
    setBusy(true);setErr("");
    const e=await onLogin(email.trim().toLowerCase(),pass);
    if(e)setErr(e);
    setBusy(false);
  };
  return(
    <div className="screen auth-screen">
      <div className="auth-top">
        <div className="logo-xl">cart<span>wise</span></div>
        <p className="auth-tag">Groceries, handled.</p>
      </div>
      <div className="auth-card">
        <h2>Welcome back</h2>
        <p className="card-sub">Sign in to your household account.</p>
        <label className="fl">Email address</label>
        <input className="fi" type="email" placeholder="you@email.com" value={email} onChange={e=>setEmail(e.target.value)} onKeyDown={e=>e.key==="Enter"&&go()} autoComplete="email"/>
        <label className="fl">Password</label>
        <div className="pw-wrap">
          <input className="fi" type={showPass?"text":"password"} placeholder="••••••••" value={pass} onChange={e=>setPass(e.target.value)} onKeyDown={e=>e.key==="Enter"&&go()} autoComplete="current-password"/>
          <button className="pw-eye" onClick={()=>setShowPass(p=>!p)} tabIndex={-1}>{showPass?"🙈":"👁️"}</button>
        </div>
        {err&&<div className="err">⚠️ {err}</div>}
        <button className="btn-p" onClick={go} disabled={busy}>{busy?<><span className="spin"/>Signing in…</>:"Sign in"}</button>
        <div className="auth-sw">Don't have an account? <button onClick={onSignup}>Sign up free →</button></div>
      </div>
      <p className="auth-fine">No credit card required. Cancel anytime.</p>
    </div>
  );
}

// ─── SIGNUP ───────────────────────────────────────────────────────────────────
function Signup({onSignup,onBack}){
  const [name,setName]=useState("");
  const [email,setEmail]=useState("");
  const [pass,setPass]=useState("");
  const [pass2,setPass2]=useState("");
  const [err,setErr]=useState("");
  const [busy,setBusy]=useState(false);
  const strength=pass.length===0?0:pass.length<6?1:pass.length<10?2:3;
  const go=async()=>{
    if(!name||!email||!pass||!pass2){setErr("Please fill in all fields.");return;}
    if(pass!==pass2){setErr("Passwords don't match.");return;}
    if(pass.length<6){setErr("Password must be at least 6 characters.");return;}
    if(!email.includes("@")){setErr("Please enter a valid email.");return;}
    setBusy(true);setErr("");
    const e=await onSignup(email.trim().toLowerCase(),pass,name.trim());
    if(e)setErr(e);
    setBusy(false);
  };
  return(
    <div className="screen auth-screen">
      <div className="auth-top">
        <div className="logo-xl">cart<span>wise</span></div>
        <p className="auth-tag">Free to join. No credit card needed.</p>
      </div>
      <div className="auth-card">
        <h2>Create your account</h2>
        <p className="card-sub">Set up your household in under 2 minutes.</p>
        <label className="fl">Last name</label>
        <input className="fi" placeholder="e.g. Johnson" value={name} onChange={e=>setName(e.target.value)}/>
        <label className="fl">Email address</label>
        <input className="fi" type="email" placeholder="you@email.com" value={email} onChange={e=>setEmail(e.target.value)}/>
        <label className="fl">Password</label>
        <input className="fi" type="password" placeholder="At least 6 characters" value={pass} onChange={e=>setPass(e.target.value)}/>
        {pass&&<div className="pw-strength"><div className="pws-bar"><div style={{width:`${strength*33}%`,background:["","#c0392b","#d4a843","#4a7c59"][strength]}}/></div><span style={{color:["","#c0392b","#d4a843","#4a7c59"][strength],fontSize:11}}>{["","Weak","Fair","Strong"][strength]}</span></div>}
        <label className="fl">Confirm password</label>
        <input className="fi" type="password" placeholder="••••••••" value={pass2} onChange={e=>setPass2(e.target.value)} onKeyDown={e=>e.key==="Enter"&&go()}/>
        {err&&<div className="err">⚠️ {err}</div>}
        <button className="btn-p" onClick={go} disabled={busy}>{busy?<><span className="spin"/>Creating account…</>:"Create account — it's free"}</button>
        <div className="auth-sw">Already have an account? <button onClick={onBack}>Sign in →</button></div>
      </div>
      <p className="auth-fine">By signing up you agree to our Terms of Service and Privacy Policy.</p>
    </div>
  );
}

// ─── ONBOARD ──────────────────────────────────────────────────────────────────
function Onboard({profile,onDone}){
  const [step,setStep]=useState(1);
  const [hhType,setHhType]=useState(profile?.hh_type||"");
  const [store,setStore]=useState(profile?.store||"walmart");
  const [budget,setBudget]=useState(String(profile?.budget||150));
  const [frugal,setFrugal]=useState(profile?.frugal||2);
  return(
    <div className="screen center-screen">
      <div className="logo-big">cart<span>wise</span></div>
      <div className="step-dots">{[1,2,3].map(s=><div key={s} className={`dot ${step===s?"active":step>s?"done":""}`}/>)}</div>
      {step===1&&<div className="card fade-in">
        <div className="ci">🏡</div>
        <h2>Welcome, {hhLabel(profile?.name)}!</h2>
        <p className="card-sub">Tell us about your household so we can personalize everything.</p>
        <label className="fl">Who's shopping?</label>
        <div className="hh-grid">{HH_TYPES.map(t=><button key={t.id} className={`hh-btn ${hhType===t.id?"sel":""}`} onClick={()=>setHhType(t.id)}><span className="hhe">{t.emoji}</span><span className="hhl">{t.label}</span><span className="hhd">{t.desc}</span></button>)}</div>
        <button className="btn-p" disabled={!hhType} onClick={()=>setStep(2)}>Continue →</button>
      </div>}
      {step===2&&<div className="card fade-in">
        <div className="ci">🏪</div>
        <h2>Where do you shop?</h2>
        <p className="card-sub">Your go-to grocery store. Easy to change later.</p>
        <div className="store-grid">{STORES.map(s=><button key={s.id} className={`store-btn ${store===s.id?"sel":""}`} onClick={()=>setStore(s.id)}>{s.logo} {s.name}</button>)}</div>
        <button className="btn-p" disabled={!store} onClick={()=>setStep(3)}>Continue →</button>
        <button className="btn-g" onClick={()=>setStep(1)}>← Back</button>
      </div>}
      {step===3&&<div className="card fade-in">
        <div className="ci">💵</div>
        <h2>Set your grocery budget</h2>
        <p className="card-sub">We'll help you stay under it every single run.</p>
        <label className="fl">Weekly budget</label>
        <div className="bw"><span className="ds">$</span><input className="fi pl" type="number" placeholder="150" value={budget} onChange={e=>setBudget(e.target.value)}/></div>
        <div className="budget-hint">💡 The average U.S. family of 4 spends ~$250/week on groceries.</div>
        <label className="fl" style={{marginTop:18}}>Default frugality</label>
        <div className="fr-grid">{FRUGAL.map(f=><button key={f.value} className={`fr-btn ${frugal===f.value?"sel":""}`} onClick={()=>setFrugal(f.value)}><span className="fe">{f.emoji}</span><span className="fl2">{f.label}</span><span className="fd">{f.desc}</span></button>)}</div>
        <button className="btn-p" disabled={!budget} onClick={()=>onDone({hh_type:hhType,store,budget:parseFloat(budget),frugal})}>Let's go 🎉</button>
        <button className="btn-g" onClick={()=>setStep(2)}>← Back</button>
      </div>}
    </div>
  );
}

// ─── HOME ─────────────────────────────────────────────────────────────────────
function Home({profile,go,onLogout,loadOrders}){
  const [lastTrip,setLastTrip]=useState(null);
  const [totalSaved,setTotalSaved]=useState(0);
  useEffect(()=>{
    loadOrders().then(orders=>{
      if(orders.length){
        setLastTrip(orders[0]);
        setTotalSaved(orders.reduce((a,o)=>a+parseFloat(o.saved||0),0));
      }
    });
  },[]);
  const s=storeObj(profile?.store);
  const frugalObj=FRUGAL.find(f=>f.value===profile?.frugal);
  return(
    <div className="screen">
      <div className="top-bar">
        <div><div className="logo-sm">cart<span>wise</span></div><div className="hh-nm">{hhLabel(profile?.name)}</div></div>
        <div style={{display:"flex",gap:6}}>
          <button className="icon-btn" onClick={()=>go("history")}>📋</button>
          <button className="icon-btn" onClick={()=>go("settings")}>⚙️</button>
        </div>
      </div>
      <div className="hero-band">
        <div className="greeting">Good to see you 👋</div>
        <h1 className="hero-q">What are we doing<br/>this week?</h1>
        <div className="hero-meta-row">
          <span className="hero-chip">{s.logo} {s.name}</span>
          <span className="hero-chip">💵 ${profile?.budget}/run</span>
          <span className="hero-chip">{frugalObj?.emoji} {frugalObj?.label}</span>
        </div>
        {profile?.schedule&&<div className="badge green-badge" style={{marginTop:10}}>🔄 {SCHEDULES.find(s=>s.id===profile.schedule)?.label} auto-run active</div>}
        {totalSaved>0&&<div className="savings-banner"><span>💚</span><span>You've saved <strong>${fmt(totalSaved)}</strong> with Cartwise so far</span></div>}
      </div>
      <div className="actions">
        <div className="tier-label">Free</div>
        <button className="act-card green-border" onClick={()=>go("optimize")}>
          <span className="act-icon">✨</span>
          <div className="at"><div className="atitle">Optimize my own list</div><div className="adesc">Build a grocery list and let AI find the best deals, swaps, and savings</div></div>
          <span className="arr">→</span>
        </button>
        <div className="tier-label" style={{marginTop:6}}>
          {profile?.is_paid?<span>Cartwise+ <span className="star-badge">⭐ Active</span></span>:<span>Cartwise+ <span className="upill">Unlock for $3.99/mo</span></span>}
        </div>
        <button className={`act-card ${profile?.is_paid?"green-bg":"dashed-border"}`} onClick={()=>profile?.is_paid?go("autorun"):go("upgrade")}>
          <span className="act-icon">🪄</span>
          <div className="at"><div className="atitle">Just make me a list</div><div className="adesc">AI builds your complete weekly grocery list — you just approve it</div>{!profile?.is_paid&&<div className="upill" style={{marginTop:5,display:"inline-block"}}>Unlock Cartwise+</div>}</div>
          <span className="arr">{profile?.is_paid?"→":"🔒"}</span>
        </button>
        <button className={`act-card ${profile?.is_paid?"":"dashed-border"}`} onClick={()=>profile?.is_paid?go("schedule"):go("upgrade")}>
          <span className="act-icon">📅</span>
          <div className="at"><div className="atitle">Set up auto-runs</div><div className="adesc">Weekly, biweekly, or monthly — Cartwise handles it automatically</div>{!profile?.is_paid&&<div className="upill" style={{marginTop:5,display:"inline-block"}}>Unlock Cartwise+</div>}</div>
          <span className="arr">{profile?.is_paid?"→":"🔒"}</span>
        </button>
      </div>
      {lastTrip&&<div className="last-trip" onClick={()=>go("history")}>
        <div className="lt-lbl">Last trip ›</div>
        <div className="lt-row"><span className="lt-store">{storeName(lastTrip.store)}</span><span className="lt-saved">💚 saved ${lastTrip.saved}</span><span className="lt-tot">${lastTrip.total}</span></div>
        <div className="lt-dt">{new Date(lastTrip.created_at).toLocaleDateString("en-US",{month:"short",day:"numeric"})} · {lastTrip.items} items · #{lastTrip.order_id}</div>
      </div>}
      <div className="fact-strip">💡 {randomTip()}</div>
    </div>
  );
}

// ─── OPTIMIZER ────────────────────────────────────────────────────────────────
function Optimizer({profile,updateProfile,go,onBack}){
  const [step,setStep]=useState(1);
  const [store,setStore]=useState(profile?.store||"walmart");
  const [budget,setBudget]=useState(String(profile?.budget||150));
  const [frugal,setFrugal]=useState(profile?.frugal||2);
  const [items,setItems]=useState([{id:1,name:"",priority:"medium",locked:false,qty:1}]);
  const [nid,setNid]=useState(2);
  const [busy,setBusy]=useState(false);
  const [result,setResult]=useState(null);
  const [err,setErr]=useState("");
  const [loadMsg,setLoadMsg]=useState("");
  const LMSGS=["Scanning for the best prices…","Comparing brand vs generic options…","Checking what fits your budget…","Finding smart swaps for you…","Almost done…"];
  const add=()=>{setItems(p=>[...p,{id:nid,name:"",priority:"medium",locked:false,qty:1}]);setNid(n=>n+1);};
  const upd=(id,f,v)=>setItems(p=>p.map(i=>i.id===id?{...i,[f]:v}:i));
  const rem=(id)=>setItems(p=>p.filter(i=>i.id!==id));
  const filled=items.filter(i=>i.name.trim());
  const runAI=async()=>{
    setBusy(true);setErr("");setStep(4);setLoadMsg(LMSGS[0]);
    let mi=0; const iv=setInterval(()=>{mi=(mi+1)%LMSGS.length;setLoadMsg(LMSGS[mi]);},1800);
    const sys="You are a grocery price optimizer. You know real retail prices at US grocery stores. Return ONLY valid JSON with no markdown, no explanation, no text outside the JSON object.";
    const msg=`Optimize this grocery shopping list for a real ${storeName(store)} trip.\nBudget: $${budget}\nFrugality mode: ${FRUGAL.find(f=>f.value===frugal)?.label}\nItems: ${filled.map(i=>`${i.name} (priority:${i.priority},qty:${i.qty}${i.locked?",brand-locked":""})`).join("; ")}\n\nReturn this JSON:\n{"optimized_list":[{"item":"Whole Milk 1gal","rec":"Great Value brand saves $1.20","reason":"Same quality, lower price","priority":"high","cost":3.28,"kept":true}],"total":87.50,"saved":22.15,"summary":"One motivating sentence about the savings."}`;
    try{ const d=await callAI(sys,msg); clearInterval(iv); setResult(d); }
    catch(e){ clearInterval(iv); setErr(e.message); }
    setBusy(false);
  };
  const goCheckout=()=>{
    const cartItems=(result.optimized_list||[]).filter(i=>i.kept).map(i=>({name:i.item,qty:1,cost:i.cost||0,note:i.rec||""}));
    go("checkout",{cart:{items:cartItems,total:result.total,saved:result.saved,store,source:"optimizer"}});
  };
  return(
    <div className="screen">
      <div className="top-bar">
        <button className="icon-btn" onClick={step>1&&step<4?()=>setStep(s=>s-1):onBack}>←</button>
        <div className="screen-title">Optimize a list</div>
        <div className="step-dots small">{[1,2,3].map(s=><div key={s} className={`dot ${step===s?"active":step>s?"done":""}`}/>)}</div>
      </div>
      {step===1&&<div className="body fade-in">
        <h2>Store & settings</h2>
        <label className="fl">Store</label>
        <div className="store-grid">{STORES.map(s=><button key={s.id} className={`store-btn ${store===s.id?"sel":""}`} onClick={()=>setStore(s.id)}>{s.logo} {s.name}</button>)}</div>
        <label className="fl">Weekly budget</label>
        <div className="bw"><span className="ds">$</span><input className="fi pl" type="number" value={budget} onChange={e=>setBudget(e.target.value)}/></div>
        <label className="fl">Frugality mode</label>
        <div className="fr-grid">{FRUGAL.map(f=><button key={f.value} className={`fr-btn ${frugal===f.value?"sel":""}`} onClick={()=>setFrugal(f.value)}><span className="fe">{f.emoji}</span><span className="fl2">{f.label}</span><span className="fd">{f.desc}</span></button>)}</div>
        <button className="btn-p" disabled={!store||!budget} onClick={()=>setStep(2)}>Add my items →</button>
      </div>}
      {step===2&&<div className="body fade-in">
        <h2>Your grocery list</h2>
        <div className="list-meta"><span className="hint">🔒 = name brand · 🔓 = generic OK</span><span className="item-count">{filled.length} item{filled.length!==1?"s":""}</span></div>
        {items.map(it=>(<div key={it.id} className="item-row">
          <span className="pdot" style={{background:PRI[it.priority]?.color}}/>
          <input className="fi flex1" placeholder="e.g. Milk, Chicken…" value={it.name} onChange={e=>upd(it.id,"name",e.target.value)}/>
          <input className="qty-in" type="number" min="1" value={it.qty} onChange={e=>upd(it.id,"qty",parseInt(e.target.value)||1)}/>
          <select className="pri-sel" value={it.priority} onChange={e=>upd(it.id,"priority",e.target.value)}>
            <option value="high">Must Have</option><option value="medium">Want</option><option value="low">Nice to Have</option>
          </select>
          <button className={`lock-btn ${it.locked?"locked":""}`} onClick={()=>upd(it.id,"locked",!it.locked)}>{it.locked?"🔒":"🔓"}</button>
          <button className="rm-btn" onClick={()=>rem(it.id)}>×</button>
        </div>))}
        <button className="btn-add" onClick={add}>+ Add another item</button>
        <button className="btn-p" disabled={!filled.length} onClick={()=>setStep(3)}>Review list →</button>
        <button className="btn-g" onClick={()=>setStep(1)}>← Back</button>
      </div>}
      {step===3&&<div className="body fade-in">
        <h2>Ready to optimize</h2>
        <div className="rev-card">{[["Store",storeName(store)],["Budget","$"+budget],["Mode",FRUGAL.find(f=>f.value===frugal)?.label],["Items",filled.length+" items"]].map(([k,v])=>(<div key={k} className="rv-row"><span className="rv-k">{k}</span><span className="rv-v">{v}</span></div>))}</div>
        <button className="btn-p" onClick={runAI}>✨ Optimize my cart</button>
        <button className="btn-g" onClick={()=>setStep(2)}>← Edit list</button>
      </div>}
      {step===4&&busy&&<div className="loading-wrap"><div className="lc">🛒</div><div className="lt">Optimizing your cart…</div><div className="ls">{loadMsg}</div><div className="load-bar"><div className="lb-fill"/></div></div>}
      {step===4&&!busy&&<div className="body fade-in">
        {err?<><div className="err">⚠️ {err}</div><button className="btn-p" onClick={()=>{setStep(3);setErr("");}}>← Try again</button></>
        :result?<>
          <h2>Your optimized cart ✨</h2>
          <div className="stat-row">
            <div className="sbox"><div className="sv">${fmt(result.total)}</div><div className="sl">Est. total</div></div>
            <div className="sbox grn"><div className="sv">+${fmt(result.saved)}</div><div className="sl">Saved</div></div>
            <div className="sbox"><div className="sv" style={{fontSize:22}}>{parseFloat(result.total)<=parseFloat(budget)?"✅":"⚠️"}</div><div className="sl">{parseFloat(result.total)<=parseFloat(budget)?"On budget":"Over budget"}</div></div>
          </div>
          {result.summary&&<div className="res-summary">"{result.summary}"</div>}
          <div className="res-list">{(result.optimized_list||[]).map((item,i)=>(<div key={i} className={`res-item ${item.kept?"":"cut"}`}>
            <div className={`rc ${item.kept?"kept":"skip"}`}>{item.kept?"✓":"✕"}</div>
            <div className="ri"><div className="rn"><span className="pdot" style={{background:PRI[item.priority]?.color||"#8a7060"}}/>{item.item}</div><div className="rr">{item.rec}</div>{item.reason&&<div className="rw">{item.reason}</div>}</div>
            <div className="rp">{item.kept&&item.cost?"$"+fmt(item.cost):"—"}</div>
          </div>))}</div>
          <button className="btn-checkout" onClick={goCheckout}>Proceed to checkout →</button>
          <button className="btn-g" onClick={onBack}>Save & finish later</button>
        </>:null}
      </div>}
    </div>
  );
}

// ─── AUTO-RUN ─────────────────────────────────────────────────────────────────
function AutoRun({profile,updateProfile,go,onBack}){
  const [phase,setPhase]=useState("config");
  const [store,setStore]=useState(profile?.store||"walmart");
  const [budget,setBudget]=useState(String(profile?.budget||150));
  const [frugal,setFrugal]=useState(profile?.frugal||2);
  const [hhType,setHhType]=useState(profile?.hh_type||"family");
  const [extras,setExtras]=useState("");
  const [list,setList]=useState(null);
  const [err,setErr]=useState("");
  const [loadMsg,setLoadMsg]=useState("");
  const LMSGS=["Building your weekly staples…","Checking what's in season…","Adding household essentials…","Balancing your budget…","Finalizing your list…"];
  const gen=async()=>{
    setPhase("gen");setErr("");setLoadMsg(LMSGS[0]);
    let mi=0; const iv=setInterval(()=>{mi=(mi+1)%LMSGS.length;setLoadMsg(LMSGS[mi]);},1800);
    const hhInfo=HH_TYPES.find(t=>t.id===hhType);
    const sys="You are a smart grocery list generator. You know real US retail grocery prices. Return ONLY valid JSON. No markdown. No text outside the JSON.";
    const msg=`Generate a realistic weekly grocery list.\nHousehold: ${hhInfo?.label} (${hhInfo?.desc})\nStore: ${storeName(store)}\nBudget: $${budget}\nMode: ${FRUGAL.find(f=>f.value===frugal)?.label}\n${extras?"Special requests: "+extras+".\n":""}\nReturn this JSON (10-12 items):\n{"list":[{"item":"Bananas","qty":1,"category":"produce","cost":1.29,"note":""},{"item":"Whole Milk 1gal","qty":1,"category":"dairy","cost":3.28,"note":"Store brand recommended"}],"total":87.50,"saved":18.00,"summary":"One encouraging sentence."}`;
    try{ const d=await callAI(sys,msg); clearInterval(iv); setList(d); setPhase("review"); }
    catch(e){ clearInterval(iv); setErr(e.message); setPhase("config"); }
  };
  const goCheckout=()=>{
    const cartItems=(list.list||[]).map(i=>({name:i.item,qty:i.qty||1,cost:i.cost||0,note:i.note||"",category:i.category}));
    go("checkout",{cart:{items:cartItems,total:list.total,saved:list.saved,store,source:"autorun"}});
  };
  if(phase==="config") return(
    <div className="screen">
      <div className="top-bar"><button className="icon-btn" onClick={onBack}>←</button><div className="screen-title">Just make me a list</div><div/></div>
      <div className="body fade-in">
        <div className="hero-card"><div style={{fontSize:40,marginBottom:8}}>🪄</div><h3>Tell us a little.<br/>We handle the rest.</h3><p>No list-making. No decisions. Just tap and groceries appear.</p></div>
        {err&&<div className="err">⚠️ {err}</div>}
        <label className="fl">Household type</label>
        <div className="hh-grid">{HH_TYPES.map(t=><button key={t.id} className={`hh-btn ${hhType===t.id?"sel":""}`} onClick={()=>setHhType(t.id)}><span className="hhe">{t.emoji}</span><span className="hhl">{t.label}</span><span className="hhd">{t.desc}</span></button>)}</div>
        <label className="fl">Store</label>
        <div className="store-grid">{STORES.map(s=><button key={s.id} className={`store-btn ${store===s.id?"sel":""}`} onClick={()=>setStore(s.id)}>{s.logo} {s.name}</button>)}</div>
        <label className="fl">Budget</label>
        <div className="bw"><span className="ds">$</span><input className="fi pl" type="number" value={budget} onChange={e=>setBudget(e.target.value)}/></div>
        <label className="fl">Frugality mode</label>
        <div className="fr-grid">{FRUGAL.map(f=><button key={f.value} className={`fr-btn ${frugal===f.value?"sel":""}`} onClick={()=>setFrugal(f.value)}><span className="fe">{f.emoji}</span><span className="fl2">{f.label}</span><span className="fd">{f.desc}</span></button>)}</div>
        <label className="fl">Anything specific this week? <span style={{color:"var(--muted)",fontStyle:"italic",textTransform:"none",letterSpacing:0}}>(optional)</span></label>
        <input className="fi" placeholder='e.g. "need more snacks" or "trying to eat more protein"' value={extras} onChange={e=>setExtras(e.target.value)}/>
        <button className="btn-p" onClick={gen}>🪄 Generate my grocery list</button>
      </div>
    </div>
  );
  if(phase==="gen") return(
    <div className="screen"><div className="top-bar"><button className="icon-btn" onClick={onBack}>←</button><div className="screen-title">Building your list…</div><div/></div>
    <div className="loading-wrap"><div className="lc">🪄</div><div className="lt">Building your list…</div><div className="ls">{loadMsg}</div><div className="load-bar"><div className="lb-fill"/></div></div></div>
  );
  return(
    <div className="screen">
      <div className="top-bar"><button className="icon-btn" onClick={()=>setPhase("config")}>←</button><div className="screen-title">Your list is ready ✓</div><div/></div>
      <div className="body fade-in">
        <div className="stat-row">
          <div className="sbox"><div className="sv">${fmt(list?.total)}</div><div className="sl">Est. total</div></div>
          <div className="sbox grn"><div className="sv">~${fmt(list?.saved)}</div><div className="sl">vs. avg</div></div>
          <div className="sbox"><div className="sv">{list?.list?.length||0}</div><div className="sl">Items</div></div>
        </div>
        {list?.summary&&<div className="res-summary">"{list.summary}"</div>}
        <div className="res-list">
          {Object.entries((list?.list||[]).reduce((a,i)=>{const c=i.category||"other";if(!a[c])a[c]=[];a[c].push(i);return a},{})).map(([cat,its])=>(
            <div key={cat}>
              <div className="cat-hdr">{CAT_EMOJI[cat]||"🛒"} {cat.charAt(0).toUpperCase()+cat.slice(1)}</div>
              {its.map((item,i)=>(<div key={i} className="res-item"><div className="rc kept">✓</div><div className="ri"><div className="rn">{item.item}{item.qty>1?` ×${item.qty}`:""}</div>{item.note&&<div className="rw">{item.note}</div>}</div><div className="rp">{item.cost?"$"+fmt(item.cost):"—"}</div></div>))}
            </div>
          ))}
        </div>
        <button className="btn-checkout" onClick={goCheckout}>Proceed to checkout →</button>
        <button className="btn-g" onClick={()=>setPhase("config")}>← Regenerate</button>
      </div>
    </div>
  );
}

// ─── CHECKOUT ─────────────────────────────────────────────────────────────────
function Checkout({profile,cart,saveOrder,onBack}){
  const [phase,setPhase]=useState("review");
  const [delivery,setDelivery]=useState("pickup");
  const [address,setAddress]=useState("");
  const [cardNum,setCardNum]=useState("");
  const [cardName,setCardName]=useState("");
  const [expiry,setExpiry]=useState("");
  const [cvv,setCvv]=useState("");
  const [tip,setTip]=useState(0);
  const [busy,setBusy]=useState(false);
  const [order,setOrder]=useState(null);
  if(!cart) return <div className="screen"><div className="body"><div className="err">No cart found.</div><button className="btn-p" onClick={onBack}>← Back home</button></div></div>;
  const deliveryFee=delivery==="delivery"?3.99:0;
  const serviceFee=parseFloat(fmt(cart.total*0.05));
  const grandTotal=parseFloat(fmt((cart.total||0)+deliveryFee+serviceFee+tip));
  const store=storeObj(cart.store);
  const fmtCard=v=>{const d=v.replace(/\D/g,"").slice(0,16);return d.replace(/(.{4})/g,"$1 ").trim();};
  const fmtExp=v=>{const d=v.replace(/\D/g,"").slice(0,4);return d.length>2?d.slice(0,2)+"/"+d.slice(2):d;};
  const isReady=cardNum.replace(/\s/g,"").length===16&&cardName.trim()&&expiry.length===5&&cvv.length>=3;
  const placeOrder=async()=>{
    setBusy(true);
    await new Promise(r=>setTimeout(r,2200));
    const oid=orderId();
    const eta=delivery==="pickup"?"Ready for curbside pickup in 2–4 hours":"Delivered to your door in 1–3 hours";
    setOrder({id:oid,eta,total:grandTotal,store:cart.store,items:cart.items?.length||0,delivery});
    await saveOrder({
      order_id:oid, store:cart.store, total:fmt(grandTotal),
      saved:fmt(cart.saved||0), items:cart.items?.length||0, delivery,
    });
    setBusy(false);setPhase("done");
  };
  const instacartURL=()=>{
    const items=(cart.items||[]).map(i=>encodeURIComponent(i.name)).join(",");
    return `https://www.instacart.com/store/${store.instacart}/storefront?search=${items}`;
  };
  if(phase==="review") return(
    <div className="screen">
      <div className="top-bar"><button className="icon-btn" onClick={onBack}>←</button><div className="screen-title">Review your cart</div><div/></div>
      <div className="body fade-in">
        <div className="checkout-store"><span style={{fontSize:30}}>{store.logo}</span><div><div className="cs-name">{store.name}</div><div className="cs-sub">{cart.items?.length||0} items · grocery order</div></div></div>
        <div className="cart-list">{(cart.items||[]).map((item,i)=>(<div key={i} className="cart-item"><div className="cil"><div className="cart-item-name">{item.name}{item.qty>1?` ×${item.qty}`:""}</div>{item.note&&<div className="cart-item-note">{item.note}</div>}</div><div className="cart-item-price">${fmt(item.cost)}</div></div>))}</div>
        {cart.saved>0&&<div className="savings-callout">💚 Cartwise saved you <strong>${fmt(cart.saved)}</strong> on this order</div>}
        <label className="fl">Fulfillment method</label>
        <div className="del-toggle">
          <button className={`dtog ${delivery==="pickup"?"active":""}`} onClick={()=>setDelivery("pickup")}>🚗 Curbside Pickup<span className="dtog-sub">Free · Ready in 2–4hr</span></button>
          <button className={`dtog ${delivery==="delivery"?"active":""}`} onClick={()=>setDelivery("delivery")}>🚚 Home Delivery<span className="dtog-sub">$3.99 · 1–3hr</span></button>
        </div>
        {delivery==="delivery"&&<><label className="fl">Delivery address</label><input className="fi" placeholder="123 Main St, City, State ZIP" value={address} onChange={e=>setAddress(e.target.value)}/></>}
        <label className="fl">Add a tip <span style={{color:"var(--muted)",fontStyle:"italic",textTransform:"none",letterSpacing:0}}>(optional)</span></label>
        <div className="tip-row">{[0,2,3,5].map(t=><button key={t} className={`tip-btn ${tip===t?"active":""}`} onClick={()=>setTip(t)}>{t===0?"No tip":"$"+t}</button>)}</div>
        <div className="order-total-box">
          <div className="ot-row"><span>Subtotal</span><span>${fmt(cart.total)}</span></div>
          {deliveryFee>0&&<div className="ot-row"><span>Delivery fee</span><span>${fmt(deliveryFee)}</span></div>}
          <div className="ot-row"><span>Service fee (5%)</span><span>${fmt(serviceFee)}</span></div>
          {tip>0&&<div className="ot-row"><span>Tip</span><span>${fmt(tip)}</span></div>}
          {cart.saved>0&&<div className="ot-row saved-row"><span>💚 AI savings</span><span>-${fmt(cart.saved)}</span></div>}
          <div className="ot-row total-row"><span>Total</span><span>${fmt(grandTotal)}</span></div>
        </div>
        <button className="btn-checkout" onClick={()=>setPhase("payment")}>Continue to payment →</button>
        <div className="instacart-alt">
          <p>Prefer to order through Instacart?</p>
          <a href={instacartURL()} target="_blank" rel="noreferrer" className="btn-instacart">🛒 Open in Instacart →</a>
        </div>
        <p className="hint center" style={{marginTop:8}}>Cartwise earns a small referral fee when you shop through Instacart. It never affects your prices.</p>
      </div>
    </div>
  );
  if(phase==="payment") return(
    <div className="screen">
      <div className="top-bar"><button className="icon-btn" onClick={()=>setPhase("review")}>←</button><div className="screen-title">Payment</div><div/></div>
      <div className="body fade-in">
        <div className="secure-badge">🔒 Secure checkout · SSL encrypted · PCI compliant</div>
        <div className="payment-total">Total: <strong>${fmt(grandTotal)}</strong></div>
        <label className="fl">Card number</label>
        <input className="fi" placeholder="1234 5678 9012 3456" value={cardNum} onChange={e=>setCardNum(fmtCard(e.target.value))} maxLength={19} inputMode="numeric"/>
        <label className="fl">Name on card</label>
        <input className="fi" placeholder="Full name as it appears on card" value={cardName} onChange={e=>setCardName(e.target.value)}/>
        <div style={{display:"flex",gap:12}}>
          <div style={{flex:1}}><label className="fl">Expiry</label><input className="fi" placeholder="MM/YY" value={expiry} onChange={e=>setExpiry(fmtExp(e.target.value))} maxLength={5} inputMode="numeric"/></div>
          <div style={{flex:1}}><label className="fl">CVV</label><input className="fi" placeholder="123" value={cvv} onChange={e=>setCvv(e.target.value.replace(/\D/g,"").slice(0,4))} maxLength={4} inputMode="numeric"/></div>
        </div>
        <div className="payment-note"><strong>⚠️ Demo mode:</strong> This is a working prototype. No real charge occurs. Stripe integration coming in the live version.</div>
        <button className="btn-checkout" disabled={busy||!isReady} onClick={placeOrder}>{busy?<><span className="spin"/>Processing your order…</>:`Place order · $${fmt(grandTotal)}`}</button>
        {busy&&<div className="processing-bar"><div className="pb-fill"/></div>}
      </div>
    </div>
  );
  if(phase==="done"&&order) return(
    <div className="screen">
      <div className="top-bar"><div/><div className="screen-title">Order confirmed</div><div/></div>
      <div className="done-screen fade-in">
        <div className="done-icon">🎉</div>
        <h2>Order placed!</h2>
        <div className="order-badge">Order #{order.id}</div>
        <p className="done-sub">{order.eta}</p>
        <div className="done-card">
          <div className="dc-row"><span>Store</span><span>{storeName(order.store)}</span></div>
          <div className="dc-row"><span>Items</span><span>{order.items} items</span></div>
          <div className="dc-row"><span>Fulfillment</span><span>{order.delivery==="pickup"?"Curbside pickup":"Home delivery"}</span></div>
          <div className="dc-row"><span>Total charged</span><span><strong>${fmt(order.total)}</strong></span></div>
          {cart.saved>0&&<div className="dc-row"><span>Saved by Cartwise</span><span className="saved-text">+${fmt(cart.saved||0)}</span></div>}
        </div>
        <p className="done-note">You'll receive a notification when your order is ready. Thank you for using Cartwise!</p>
        <button className="btn-p" style={{maxWidth:280,marginTop:28}} onClick={onBack}>Back to home</button>
      </div>
    </div>
  );
}

// ─── SCHEDULE ─────────────────────────────────────────────────────────────────
function Schedule({profile,updateProfile,onBack}){
  const [sel,setSel]=useState(profile?.schedule||null);
  const [saved,setSaved]=useState(false);
  const save=async()=>{await updateProfile({schedule:sel});setSaved(true);setTimeout(()=>{setSaved(false);onBack();},1400);};
  return(
    <div className="screen"><div className="top-bar"><button className="icon-btn" onClick={onBack}>←</button><div className="screen-title">Auto-run schedule</div><div/></div>
    <div className="body fade-in">
      <div className="hero-card"><div style={{fontSize:40,marginBottom:8}}>📅</div><h3>Set it and forget it.</h3><p>Cartwise generates and submits your order on schedule. You get a 24-hour nudge to approve or skip — if you don't respond, it goes automatically.</p></div>
      <label className="fl">How often?</label>
      <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:18}}>
        {SCHEDULES.map(s=>(<button key={s.id} className={`sched-btn ${sel===s.id?"sel":""}`} onClick={()=>setSel(s.id)}><span style={{fontSize:24}}>{s.emoji}</span><div style={{flex:1}}><div className="sb-label">{s.label}</div><div className="sb-desc">{s.desc}</div></div>{sel===s.id&&<span style={{color:"var(--green)",fontSize:20}}>✓</span>}</button>))}
        {sel&&<button className="sched-btn" style={{opacity:.6}} onClick={()=>setSel(null)}><span style={{fontSize:24}}>🚫</span><div style={{flex:1}}><div className="sb-label">Turn off auto-runs</div><div className="sb-desc">You can always re-enable this</div></div></button>}
      </div>
      <button className="btn-p" onClick={save}>{saved?"✓ Saved!":"Save schedule"}</button>
      <button className="btn-g" onClick={onBack}>← Cancel</button>
    </div></div>
  );
}

// ─── HISTORY ─────────────────────────────────────────────────────────────────
function History({loadOrders,onBack}){
  const [orders,setOrders]=useState([]);
  const [loading,setLoading]=useState(true);
  useEffect(()=>{ loadOrders().then(o=>{setOrders(o);setLoading(false);}); },[]);
  const totalSaved=orders.reduce((a,o)=>a+parseFloat(o.saved||0),0);
  const totalSpent=orders.reduce((a,o)=>a+parseFloat(o.total||0),0);
  return(
    <div className="screen"><div className="top-bar"><button className="icon-btn" onClick={onBack}>←</button><div className="screen-title">Order history</div><div/></div>
    <div className="body fade-in">
      {loading?<div className="loading-wrap" style={{minHeight:"40vh"}}><div className="lc" style={{fontSize:32}}>📋</div><div className="ls">Loading your orders…</div></div>
      :orders.length===0?<div className="empty-state"><div style={{fontSize:52}}>🛒</div><p>No orders yet. Your trip history will appear here after your first order.</p></div>
      :<>
        <div className="stat-row" style={{marginBottom:16}}>
          <div className="sbox"><div className="sv">{orders.length}</div><div className="sl">Orders</div></div>
          <div className="sbox"><div className="sv">${fmt(totalSpent)}</div><div className="sl">Total spent</div></div>
          <div className="sbox grn"><div className="sv">${fmt(totalSaved)}</div><div className="sl">Total saved</div></div>
        </div>
        <div className="hist-list">{orders.map((o,i)=>(<div key={i} className="hist-item">
          <div className="hi-top"><span className="hi-store">{storeName(o.store)}</span><span className="hi-date">{new Date(o.created_at).toLocaleDateString("en-US",{month:"short",day:"numeric"})}</span></div>
          <div className="hi-mid"><span className="hi-items">{o.items} items</span><span className="hi-saved">💚 saved ${o.saved}</span><span className="hi-total">${o.total}</span></div>
          <div className="hi-bot">Order #{o.order_id} · {o.delivery==="pickup"?"Curbside pickup":"Home delivery"}</div>
        </div>))}</div>
      </>}
    </div></div>
  );
}

// ─── UPGRADE ─────────────────────────────────────────────────────────────────
function Upgrade({profile,onUpgrade,onBack}){
  return(
    <div className="screen upgrade-bg">
      <div className="top-bar" style={{background:"transparent",border:"none"}}><button className="icon-btn" onClick={onBack}>←</button><div className="screen-title">Cartwise+</div><div/></div>
      <div className="upgrade-body">
        <div className="upgrade-star">⭐</div>
        <h2 className="up-h2">Groceries on autopilot.</h2>
        <p className="up-sub">For households that want it handled — automatically, intelligently, every week.</p>
        <div className="feat-list">{[["🪄","Just make me a list","AI generates your full weekly grocery list — no thinking required"],["📅","Automatic recurring runs","Set weekly, biweekly, or monthly — Cartwise handles everything"],["🔔","Always in control","One-tap approve or skip before every auto-run, 24 hours ahead"],["🛒","One-tap checkout","Send your list to curbside pickup or delivery instantly"],["📊","Full order history","Track every trip, every saving, month over month"]].map(([ic,ti,de])=>(<div key={ti} className="feat-row"><span className="feat-ic">{ic}</span><div><div className="feat-ti">{ti}</div><div className="feat-de">{de}</div></div></div>))}</div>
        <div className="price-block"><div className="price-row"><span className="price-big">$3.99</span><span className="price-mo">/month</span></div><p className="price-note">Most families save $40+ per trip. This pays for itself in minutes.</p></div>
        <button className="btn-upgrade" onClick={onUpgrade}>Get Cartwise+ →</button>
        <button className="btn-g" onClick={onBack}>Maybe later</button>
        <p className="upgrade-fine">Cancel anytime. No hidden fees. No contracts. Ever.</p>
      </div>
    </div>
  );
}

// ─── SETTINGS ────────────────────────────────────────────────────────────────
function Settings({profile,updateProfile,onBack,onLogout}){
  const [name,setName]=useState(profile?.name||"");
  const [store,setStore]=useState(profile?.store||"walmart");
  const [budget,setBudget]=useState(String(profile?.budget||150));
  const [frugal,setFrugal]=useState(profile?.frugal||2);
  const [hhType,setHhType]=useState(profile?.hh_type||"family");
  const [saved,setSaved]=useState(false);
  const [showConfirm,setShowConfirm]=useState(false);
  const save=async()=>{await updateProfile({name:name.trim(),store,budget:parseFloat(budget),frugal,hh_type:hhType});setSaved(true);setTimeout(()=>setSaved(false),2000);};
  return(
    <div className="screen"><div className="top-bar"><button className="icon-btn" onClick={onBack}>←</button><div className="screen-title">Settings</div><div/></div>
    <div className="body fade-in">
      <div className="settings-email"><span>👤 Signed in as</span><strong>{profile?.email}</strong></div>
      {profile?.is_paid&&<div className="badge green-badge" style={{marginBottom:14,display:"block"}}>⭐ Cartwise+ active</div>}
      <label className="fl">Last name</label>
      <input className="fi" value={name} onChange={e=>setName(e.target.value)}/>
      <label className="fl">Household type</label>
      <div className="hh-grid">{HH_TYPES.map(t=><button key={t.id} className={`hh-btn ${hhType===t.id?"sel":""}`} onClick={()=>setHhType(t.id)}><span className="hhe">{t.emoji}</span><span className="hhl">{t.label}</span><span className="hhd">{t.desc}</span></button>)}</div>
      <label className="fl">Default store</label>
      <div className="store-grid">{STORES.map(s=><button key={s.id} className={`store-btn ${store===s.id?"sel":""}`} onClick={()=>setStore(s.id)}>{s.logo} {s.name}</button>)}</div>
      <label className="fl">Weekly budget</label>
      <div className="bw"><span className="ds">$</span><input className="fi pl" type="number" value={budget} onChange={e=>setBudget(e.target.value)}/></div>
      <label className="fl">Default frugality</label>
      <div className="fr-grid">{FRUGAL.map(f=><button key={f.value} className={`fr-btn ${frugal===f.value?"sel":""}`} onClick={()=>setFrugal(f.value)}><span className="fe">{f.emoji}</span><span className="fl2">{f.label}</span><span className="fd">{f.desc}</span></button>)}</div>
      <button className="btn-p" onClick={save}>{saved?"✓ Changes saved!":"Save changes"}</button>
      <div className="settings-divider"/>
      {!showConfirm
        ?<button className="btn-g" style={{color:"#c0392b"}} onClick={()=>setShowConfirm(true)}>Sign out</button>
        :<div className="confirm-logout"><p>Are you sure you want to sign out?</p><div style={{display:"flex",gap:10}}><button className="btn-p" style={{flex:1,marginTop:0,background:"#c0392b"}} onClick={onLogout}>Yes, sign out</button><button className="btn-p" style={{flex:1,marginTop:0,background:"var(--muted)"}} onClick={()=>setShowConfirm(false)}>Cancel</button></div></div>}
    </div></div>
  );
}

// ─── CSS ──────────────────────────────────────────────────────────────────────
const CSS=`
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
:root{--cream:#faf6ef;--warm:#f5ede0;--brown:#3d2b1f;--bl:#a07860;--green:#4a7c59;--gl:#6a9e77;--gp:#e8f2eb;--border:#e0d4c0;--text:#2d1f14;--muted:#8a7060;--shadow:0 2px 12px rgba(61,43,31,.09);--shadow-md:0 6px 24px rgba(61,43,31,.13);}
body{background:var(--cream);color:var(--text);font-family:'DM Sans',sans-serif;-webkit-font-smoothing:antialiased;min-height:100vh;}
.screen{min-height:100vh;background:var(--cream);max-width:480px;margin:0 auto;padding-bottom:60px;}
.center-screen{display:flex;flex-direction:column;align-items:center;padding:36px 20px;}
.auth-screen{display:flex;flex-direction:column;align-items:center;padding:40px 20px 24px;min-height:100vh;background:var(--warm);}
.auth-top{text-align:center;margin-bottom:24px;}
.logo-xl{font-family:'Caveat',cursive;font-size:54px;font-weight:700;color:var(--brown);line-height:1;}
.logo-xl span{color:var(--green);}
.auth-tag{font-family:'Lora',serif;font-style:italic;color:var(--muted);font-size:16px;margin-top:6px;}
.auth-card{width:100%;max-width:420px;background:#fff;border:1px solid var(--border);border-radius:24px;padding:28px 24px;box-shadow:var(--shadow-md);}
.auth-card h2{font-family:'Lora',serif;font-size:23px;font-weight:700;color:var(--brown);margin-bottom:4px;}
.card-sub{font-family:'Lora',serif;font-style:italic;color:var(--muted);font-size:13px;margin-bottom:6px;line-height:1.6;}
.auth-fine{font-size:11px;color:var(--muted);margin-top:14px;text-align:center;max-width:320px;}
.pw-wrap{position:relative;}
.pw-eye{position:absolute;right:12px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;font-size:16px;padding:4px;}
.pw-strength{display:flex;align-items:center;gap:8px;margin-top:5px;}
.pws-bar{flex:1;height:4px;background:var(--border);border-radius:2px;overflow:hidden;}
.pws-bar div{height:100%;transition:width .4s,background .4s;border-radius:2px;}
.logo-big{font-family:'Caveat',cursive;font-size:46px;font-weight:700;color:var(--brown);margin-bottom:14px;}
.logo-big span{color:var(--green);}
.step-dots{display:flex;gap:8px;margin-bottom:18px;align-items:center;}
.step-dots.small{margin:0;}
.dot{width:8px;height:8px;border-radius:50%;background:var(--border);transition:all .35s;}
.dot.active{background:var(--green);width:24px;border-radius:4px;}
.dot.done{background:var(--gl);}
.card{width:100%;max-width:430px;background:#fff;border:1px solid var(--border);border-radius:24px;padding:26px 22px;box-shadow:var(--shadow);}
.card h2{font-family:'Lora',serif;font-size:22px;font-weight:700;color:var(--brown);margin-bottom:6px;}
.ci{font-size:42px;margin-bottom:8px;}
.err{background:#fdf0ee;border:1px solid #f5c0b8;border-radius:10px;padding:11px 14px;font-size:13px;color:#c0392b;margin-top:10px;line-height:1.5;}
.auth-sw{text-align:center;font-size:13px;color:var(--muted);margin-top:14px;}
.auth-sw button{background:none;border:none;color:var(--green);cursor:pointer;font-size:13px;font-weight:500;text-decoration:underline;padding:0;}
.hh-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin:8px 0 6px;}
.hh-btn{background:var(--cream);border:1.5px solid var(--border);border-radius:14px;padding:14px 10px;cursor:pointer;transition:all .2s;text-align:center;display:flex;flex-direction:column;align-items:center;gap:4px;}
.hh-btn:hover{border-color:var(--gl);}.hh-btn.sel{border-color:var(--green);background:var(--gp);}
.hhe{font-size:26px;}.hhl{font-family:'DM Sans',sans-serif;font-size:13px;font-weight:500;color:var(--text);}.hhd{font-size:11px;color:var(--muted);}
.fl{display:block;font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:var(--muted);margin-bottom:6px;margin-top:16px;font-weight:500;}
.fi{width:100%;background:var(--cream);border:1.5px solid var(--border);border-radius:12px;padding:12px 14px;font-family:'DM Sans',sans-serif;font-size:15px;color:var(--text);outline:none;transition:border .2s;}
.fi:focus{border-color:var(--green);background:#fff;}.fi::placeholder{color:#c0b0a0;}.fi.flex1{flex:1;}
.hint{font-size:12px;color:var(--muted);}.hint.center{text-align:center;}
.budget-hint{background:var(--gp);border:1px solid #c8dfcc;border-radius:9px;padding:9px 12px;font-size:12px;color:var(--green);margin-top:8px;}
.bw{position:relative;}.ds{position:absolute;left:14px;top:50%;transform:translateY(-50%);color:var(--muted);font-size:17px;}.fi.pl{padding-left:28px;}
.store-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:7px;margin-bottom:2px;}
.store-btn{background:var(--cream);border:1.5px solid var(--border);border-radius:10px;padding:10px 12px;font-family:'DM Sans',sans-serif;font-size:12px;color:var(--bl);cursor:pointer;transition:all .2s;text-align:left;}
.store-btn:hover{border-color:var(--gl);}.store-btn.sel{border-color:var(--green);color:var(--green);background:var(--gp);font-weight:500;}
.fr-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;}
.fr-btn{background:var(--cream);border:1.5px solid var(--border);border-radius:13px;padding:12px;cursor:pointer;transition:all .2s;text-align:left;display:flex;flex-direction:column;gap:3px;}
.fr-btn:hover{border-color:var(--gl);}.fr-btn.sel{border-color:var(--green);background:var(--gp);}
.fe{font-size:19px;}.fl2{font-size:12px;font-weight:500;color:var(--text);}.fd{font-size:11px;color:var(--muted);}
.btn-p{width:100%;background:var(--green);color:#fff;border:none;border-radius:100px;padding:14px;font-family:'DM Sans',sans-serif;font-size:15px;font-weight:500;cursor:pointer;transition:all .2s;margin-top:15px;display:flex;align-items:center;justify-content:center;gap:8px;}
.btn-p:hover:not(:disabled){background:var(--gl);transform:translateY(-1px);box-shadow:0 4px 14px rgba(74,124,89,.25);}
.btn-p:disabled{opacity:.35;cursor:not-allowed;transform:none;}
.btn-g{width:100%;background:none;border:none;color:var(--muted);font-family:'DM Sans',sans-serif;font-size:13px;cursor:pointer;padding:9px;margin-top:4px;}
.btn-g:hover{color:var(--brown);}
.btn-add{width:100%;background:none;border:1.5px dashed var(--border);border-radius:10px;padding:11px;font-size:13px;color:var(--muted);cursor:pointer;transition:all .2s;margin:6px 0;}
.btn-add:hover{border-color:var(--green);color:var(--green);}
.btn-checkout{width:100%;background:var(--brown);color:#fff;border:none;border-radius:100px;padding:15px;font-family:'DM Sans',sans-serif;font-size:16px;font-weight:600;cursor:pointer;transition:all .2s;margin-top:6px;box-shadow:0 4px 16px rgba(61,43,31,.2);display:flex;align-items:center;justify-content:center;gap:8px;}
.btn-checkout:hover:not(:disabled){background:#5a3a28;transform:translateY(-1px);}
.btn-checkout:disabled{opacity:.4;cursor:not-allowed;transform:none;}
.btn-upgrade{width:100%;background:var(--green);color:#fff;border:none;border-radius:100px;padding:15px;font-family:'DM Sans',sans-serif;font-size:16px;font-weight:500;cursor:pointer;transition:all .2s;box-shadow:0 4px 13px rgba(74,124,89,.25);margin-bottom:4px;}
.btn-upgrade:hover{background:var(--gl);transform:translateY(-1px);}
.btn-instacart{display:block;background:#fff;border:2px solid var(--green);color:var(--green);border-radius:100px;padding:12px;font-family:'DM Sans',sans-serif;font-size:14px;font-weight:600;text-align:center;text-decoration:none;transition:all .2s;margin-top:8px;}
.btn-instacart:hover{background:var(--gp);}
.icon-btn{background:none;border:none;font-size:20px;cursor:pointer;padding:8px;border-radius:8px;transition:background .2s;line-height:1;}
.icon-btn:hover{background:var(--warm);}
.top-bar{display:flex;justify-content:space-between;align-items:center;padding:14px 18px;border-bottom:1px solid var(--border);background:var(--cream);position:sticky;top:0;z-index:10;backdrop-filter:blur(8px);}
.logo-sm{font-family:'Caveat',cursive;font-size:26px;font-weight:700;color:var(--brown);line-height:1;}
.logo-sm span{color:var(--green);}
.hh-nm{font-family:'Caveat',cursive;font-size:13px;color:var(--muted);line-height:1;}
.screen-title{font-family:'Lora',serif;font-size:16px;font-weight:700;color:var(--brown);}
.hero-band{padding:20px 18px 18px;background:var(--warm);border-bottom:1px solid var(--border);}
.greeting{font-size:13px;color:var(--muted);margin-bottom:3px;}
.hero-q{font-family:'Lora',serif;font-size:27px;font-weight:700;color:var(--brown);line-height:1.25;margin-bottom:10px;}
.hero-meta-row{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:4px;}
.hero-chip{background:#fff;border:1px solid var(--border);border-radius:100px;padding:4px 12px;font-size:12px;color:var(--bl);}
.badge{display:inline-block;border-radius:100px;padding:4px 12px;font-size:12px;font-weight:500;}
.green-badge{background:var(--gp);border:1px solid #b8d4bf;color:var(--green);}
.star-badge{background:#fef9ee;border:1px solid #d4a843;color:#b8860b;border-radius:100px;padding:2px 9px;font-size:11px;margin-left:6px;}
.savings-banner{display:flex;align-items:center;gap:8px;background:var(--gp);border:1px solid #b8d4bf;border-radius:10px;padding:9px 13px;margin-top:10px;font-size:13px;color:var(--green);}
.actions{padding:14px 16px;display:flex;flex-direction:column;gap:8px;}
.tier-label{font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:var(--muted);margin-bottom:1px;margin-top:2px;font-weight:600;}
.act-card{background:#fff;border:1.5px solid var(--border);border-radius:16px;padding:15px;text-align:left;cursor:pointer;transition:all .22s;box-shadow:var(--shadow);display:flex;align-items:center;gap:12px;width:100%;}
.act-card:hover{transform:translateY(-2px);box-shadow:var(--shadow-md);}
.green-border{border-color:var(--green);}.green-bg{background:var(--gp);border-color:var(--green);}.dashed-border{border-style:dashed;}
.act-icon{font-size:24px;flex-shrink:0;}.at{flex:1;}.atitle{font-family:'Lora',serif;font-size:16px;font-weight:700;color:var(--brown);margin-bottom:2px;}.adesc{font-size:12px;color:var(--muted);line-height:1.5;}.arr{font-size:17px;color:var(--green);flex-shrink:0;}
.upill{display:inline-block;background:var(--green);color:#fff;border-radius:100px;padding:2px 10px;font-size:11px;font-weight:500;}
.last-trip{margin:0 16px;background:#fff;border:1px solid var(--border);border-radius:13px;padding:13px 15px;cursor:pointer;transition:all .2s;box-shadow:var(--shadow);}
.last-trip:hover{border-color:var(--green);}
.lt-lbl{font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--muted);margin-bottom:5px;font-weight:600;}
.lt-row{display:flex;align-items:center;gap:10px;font-size:14px;color:var(--brown);}
.lt-store{font-family:'Lora',serif;font-weight:600;}.lt-saved{color:var(--green);font-size:12px;margin-left:auto;}.lt-tot{font-family:'Lora',serif;font-weight:700;}
.lt-dt{font-size:11px;color:var(--muted);margin-top:3px;}
.fact-strip{margin:14px 16px 0;background:var(--warm);border-radius:12px;padding:12px 15px;font-size:12px;color:var(--muted);line-height:1.6;}
.body{padding:18px;}
.body h2{font-family:'Lora',serif;font-size:22px;font-weight:700;color:var(--brown);margin-bottom:14px;}
.hero-card{background:var(--warm);border:1px solid var(--border);border-radius:16px;padding:18px;margin-bottom:10px;text-align:center;}
.hero-card h3{font-family:'Lora',serif;font-size:19px;font-weight:700;color:var(--brown);margin-bottom:6px;line-height:1.3;}
.hero-card p{font-family:'Lora',serif;font-style:italic;color:var(--muted);font-size:13px;line-height:1.6;}
.list-meta{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;}
.item-count{font-size:12px;font-weight:600;color:var(--green);background:var(--gp);border-radius:100px;padding:2px 10px;}
.item-row{display:flex;gap:6px;align-items:center;margin-bottom:8px;}
.pdot{width:8px;height:8px;border-radius:50%;flex-shrink:0;}
.qty-in{width:48px;background:var(--cream);border:1.5px solid var(--border);border-radius:9px;padding:11px 6px;font-size:13px;color:var(--text);text-align:center;outline:none;transition:border .2s;}
.qty-in:focus{border-color:var(--green);}
.pri-sel{background:var(--cream);border:1.5px solid var(--border);border-radius:9px;padding:11px 6px;font-size:11px;color:var(--text);outline:none;cursor:pointer;}
.lock-btn{background:none;border:1.5px solid var(--border);border-radius:8px;padding:9px 8px;cursor:pointer;font-size:13px;transition:all .2s;line-height:1;}
.lock-btn.locked{border-color:#d4a843;background:#fef9ee;}
.rm-btn{background:none;border:none;color:#ccc;cursor:pointer;font-size:20px;padding:4px;line-height:1;}
.rm-btn:hover{color:#c0392b;}
.rev-card{background:#fff;border:1px solid var(--border);border-radius:13px;overflow:hidden;margin-bottom:10px;}
.rv-row{display:flex;justify-content:space-between;align-items:center;padding:10px 14px;border-bottom:1px solid var(--border);font-size:14px;}
.rv-row:last-child{border-bottom:none;}.rv-k{color:var(--muted);}.rv-v{color:var(--green);font-weight:600;}
.loading-wrap{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:60vh;gap:12px;padding:20px;}
.lc{font-size:52px;animation:bounce 1.1s ease-in-out infinite;}
@keyframes bounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-14px)}}
.lt{font-family:'Lora',serif;font-size:21px;color:var(--brown);font-weight:600;}
.ls{font-size:13px;color:var(--muted);text-align:center;max-width:260px;line-height:1.6;min-height:40px;}
.load-bar{width:200px;height:4px;background:var(--border);border-radius:2px;overflow:hidden;margin-top:4px;}
.lb-fill{height:100%;background:linear-gradient(90deg,var(--green),var(--gl));border-radius:2px;animation:lb 2.5s ease-in-out infinite;}
@keyframes lb{0%{width:15%;margin-left:0}50%{width:55%;margin-left:20%}100%{width:15%;margin-left:70%}}
.stat-row{display:flex;gap:8px;margin-bottom:12px;}
.sbox{flex:1;background:#fff;border:1px solid var(--border);border-radius:13px;padding:12px;text-align:center;box-shadow:var(--shadow);}
.sbox.grn{background:var(--gp);border-color:#b8d4bf;}
.sv{font-family:'Lora',serif;font-size:20px;font-weight:700;color:var(--brown);}
.sbox.grn .sv{color:var(--green);}
.sl{font-size:10px;color:var(--muted);margin-top:3px;text-transform:uppercase;letter-spacing:.5px;}
.res-summary{background:var(--gp);border:1px solid #b8d4bf;border-radius:12px;padding:12px 14px;font-family:'Lora',serif;font-style:italic;font-size:14px;color:var(--green);margin-bottom:12px;line-height:1.7;}
.res-list{background:#fff;border:1px solid var(--border);border-radius:13px;overflow:hidden;margin-bottom:14px;box-shadow:var(--shadow);}
.cat-hdr{padding:8px 14px 6px;font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:var(--muted);background:var(--warm);border-bottom:1px solid var(--border);font-weight:600;}
.res-item{display:flex;align-items:flex-start;gap:10px;padding:12px 14px;border-bottom:1px solid var(--border);}
.res-item:last-child{border-bottom:none;}.res-item.cut{opacity:.45;}
.rc{width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;flex-shrink:0;margin-top:2px;font-weight:700;}
.rc.kept{background:var(--gp);color:var(--green);}.rc.skip{background:#fef3f2;color:#c0392b;}
.ri{flex:1;min-width:0;}.rn{font-size:14px;font-weight:500;color:var(--text);display:flex;align-items:center;gap:6px;}.rr{font-size:12px;color:var(--green);margin-top:2px;font-weight:500;}.rw{font-size:11px;color:var(--muted);margin-top:2px;font-style:italic;line-height:1.4;}
.rp{font-family:'Lora',serif;font-size:14px;font-weight:700;color:var(--green);flex-shrink:0;padding-top:2px;}
.checkout-store{display:flex;align-items:center;gap:13px;background:var(--warm);border:1px solid var(--border);border-radius:14px;padding:14px 16px;margin-bottom:14px;}
.cs-name{font-family:'Lora',serif;font-size:17px;font-weight:700;color:var(--brown);}.cs-sub{font-size:12px;color:var(--muted);}
.cart-list{background:#fff;border:1px solid var(--border);border-radius:13px;overflow:hidden;margin-bottom:12px;box-shadow:var(--shadow);}
.cart-item{display:flex;align-items:center;gap:10px;padding:11px 14px;border-bottom:1px solid var(--border);}
.cart-item:last-child{border-bottom:none;}.cil{flex:1;min-width:0;}
.cart-item-name{font-size:14px;font-weight:500;color:var(--text);}.cart-item-note{font-size:11px;color:var(--green);font-style:italic;margin-top:2px;}
.cart-item-price{font-family:'Lora',serif;font-size:14px;font-weight:700;color:var(--green);flex-shrink:0;}
.savings-callout{background:var(--gp);border:1px solid #b8d4bf;border-radius:11px;padding:10px 14px;font-size:13px;color:var(--green);margin-bottom:14px;}
.del-toggle{display:flex;gap:9px;margin:8px 0 14px;}
.dtog{flex:1;background:var(--cream);border:1.5px solid var(--border);border-radius:12px;padding:11px;font-size:12px;color:var(--muted);cursor:pointer;transition:all .2s;display:flex;flex-direction:column;align-items:center;gap:3px;font-family:'DM Sans',sans-serif;}
.dtog.active{background:var(--gp);border-color:var(--green);color:var(--green);font-weight:500;}.dtog-sub{font-size:10px;opacity:.7;}
.tip-row{display:flex;gap:8px;margin:8px 0 14px;}
.tip-btn{flex:1;background:var(--cream);border:1.5px solid var(--border);border-radius:10px;padding:10px;font-size:13px;color:var(--muted);cursor:pointer;transition:all .2s;font-family:'DM Sans',sans-serif;}
.tip-btn.active{background:var(--gp);border-color:var(--green);color:var(--green);font-weight:600;}
.order-total-box{background:var(--warm);border:1px solid var(--border);border-radius:14px;padding:14px 16px;margin-bottom:14px;}
.ot-row{display:flex;justify-content:space-between;font-size:14px;color:var(--brown);padding:5px 0;}
.saved-row{color:var(--green);font-weight:500;}.total-row{font-weight:700;font-size:17px;padding-top:10px;border-top:1.5px solid var(--border);margin-top:4px;}
.instacart-alt{background:#fff;border:1px solid var(--border);border-radius:14px;padding:14px 16px;margin-top:14px;text-align:center;box-shadow:var(--shadow);}
.instacart-alt p{font-size:13px;color:var(--muted);margin-bottom:4px;}
.secure-badge{background:var(--gp);border:1px solid #b8d4bf;border-radius:100px;padding:7px 16px;font-size:12px;color:var(--green);font-weight:500;text-align:center;margin-bottom:14px;}
.payment-total{font-family:'Lora',serif;font-size:22px;color:var(--brown);text-align:center;margin-bottom:18px;}
.payment-note{background:#fef9ee;border:1px solid #d4a843;border-radius:12px;padding:12px 14px;font-size:13px;color:#8a6020;margin-top:14px;line-height:1.6;}
.processing-bar{width:100%;height:5px;background:var(--border);border-radius:3px;margin-top:14px;overflow:hidden;}
.pb-fill{height:100%;background:linear-gradient(90deg,var(--green),var(--gl));border-radius:3px;animation:pb 2.2s ease forwards;}
@keyframes pb{from{width:0}to{width:100%}}
.done-screen{display:flex;flex-direction:column;align-items:center;text-align:center;padding:36px 28px;}
.done-icon{font-size:70px;margin-bottom:12px;animation:pop .5s ease;}
@keyframes pop{0%{transform:scale(.5);opacity:0}70%{transform:scale(1.15)}100%{transform:scale(1);opacity:1}}
.done-screen h2{font-family:'Lora',serif;font-size:30px;font-weight:700;color:var(--brown);margin-bottom:12px;}
.order-badge{display:inline-block;background:var(--gp);border:1px solid #b8d4bf;border-radius:100px;padding:5px 18px;font-size:13px;color:var(--green);font-weight:600;margin-bottom:8px;}
.done-sub{font-family:'Lora',serif;font-style:italic;font-size:16px;color:var(--green);margin-bottom:22px;}
.done-card{width:100%;max-width:320px;background:#fff;border:1px solid var(--border);border-radius:16px;padding:16px;text-align:left;box-shadow:var(--shadow);}
.dc-row{display:flex;justify-content:space-between;font-size:14px;color:var(--brown);padding:8px 0;border-bottom:1px solid var(--border);}
.dc-row:last-child{border-bottom:none;}.saved-text{color:var(--green);font-weight:700;}
.done-note{font-size:13px;color:var(--muted);margin-top:18px;max-width:280px;line-height:1.6;}
.sched-btn{display:flex;align-items:center;gap:13px;background:#fff;border:1.5px solid var(--border);border-radius:14px;padding:15px 16px;cursor:pointer;transition:all .2s;width:100%;box-shadow:var(--shadow);}
.sched-btn:hover{border-color:var(--gl);}.sched-btn.sel{border-color:var(--green);background:var(--gp);}
.sb-label{font-family:'Lora',serif;font-size:16px;font-weight:600;color:var(--brown);}.sb-desc{font-size:12px;color:var(--muted);margin-top:2px;}
.hist-list{display:flex;flex-direction:column;gap:10px;}
.hist-item{background:#fff;border:1px solid var(--border);border-radius:14px;padding:14px 16px;box-shadow:var(--shadow);}
.hi-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;}
.hi-store{font-family:'Lora',serif;font-size:16px;font-weight:700;color:var(--brown);}.hi-date{font-size:12px;color:var(--muted);}
.hi-mid{display:flex;align-items:center;gap:10px;font-size:13px;margin-bottom:4px;}
.hi-items{color:var(--muted);font-size:12px;}.hi-saved{color:var(--green);font-size:12px;font-weight:500;}.hi-total{margin-left:auto;font-family:'Lora',serif;font-weight:700;color:var(--brown);font-size:15px;}
.hi-bot{font-size:11px;color:var(--muted);}
.empty-state{text-align:center;padding:70px 20px;display:flex;flex-direction:column;align-items:center;gap:14px;}
.empty-state p{font-family:'Lora',serif;font-style:italic;color:var(--muted);font-size:15px;max-width:240px;line-height:1.7;}
.upgrade-bg{background:var(--warm);}
.upgrade-body{padding:16px 20px 30px;display:flex;flex-direction:column;align-items:center;}
.upgrade-star{font-size:54px;margin-bottom:10px;}
.up-h2{font-family:'Lora',serif;font-size:28px;font-weight:700;color:var(--brown);margin-bottom:8px;text-align:center;}
.up-sub{font-family:'Lora',serif;font-style:italic;color:var(--muted);font-size:14px;margin-bottom:22px;line-height:1.8;max-width:300px;text-align:center;}
.feat-list{width:100%;background:#fff;border:1px solid var(--border);border-radius:18px;overflow:hidden;margin-bottom:22px;box-shadow:var(--shadow);}
.feat-row{display:flex;align-items:flex-start;gap:13px;padding:13px 16px;border-bottom:1px solid var(--border);}
.feat-row:last-child{border-bottom:none;}.feat-ic{font-size:20px;flex-shrink:0;margin-top:2px;}.feat-ti{font-size:14px;font-weight:600;color:var(--text);}.feat-de{font-size:12px;color:var(--muted);margin-top:2px;line-height:1.5;}
.price-block{text-align:center;margin-bottom:18px;}
.price-row{display:flex;align-items:baseline;gap:4px;justify-content:center;margin-bottom:4px;}
.price-big{font-family:'Lora',serif;font-size:50px;font-weight:700;color:var(--brown);}.price-mo{font-size:18px;color:var(--muted);}
.price-note{font-size:13px;color:var(--green);line-height:1.5;}.upgrade-fine{font-size:12px;color:var(--muted);margin-top:10px;text-align:center;}
.settings-email{background:var(--warm);border:1px solid var(--border);border-radius:11px;padding:10px 14px;font-size:13px;color:var(--muted);margin-bottom:8px;display:flex;gap:8px;align-items:center;}
.settings-email strong{color:var(--text);}
.settings-divider{height:1px;background:var(--border);margin:22px 0;}
.confirm-logout{background:#fdf0ee;border:1px solid #f5c0b8;border-radius:13px;padding:14px;margin-top:8px;}
.confirm-logout p{font-size:13px;color:var(--brown);text-align:center;margin-bottom:10px;}
.spin{display:inline-block;width:14px;height:14px;border:2px solid rgba(255,255,255,.4);border-top-color:#fff;border-radius:50%;animation:spin .7s linear infinite;}
@keyframes spin{to{transform:rotate(360deg)}}
.fade-in{animation:fadeUp .35s ease both;}
@keyframes fadeUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
`;
