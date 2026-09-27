import { useState, useEffect, useMemo } from "react";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragOverlay, useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

const PROXY = "https://todoist-proxy.apoco211.workers.dev";
const TOKEN_KEY = "todoist_token";
const REPO = "apoco211/Daily-Todo";

function SortableItem({ id, task, parentContent, showBreadcrumb }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}
      className="flex gap-2 p-3 rounded-xl border mb-2 bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 shadow-sm cursor-grab">
      <span className="text-zinc-400">≡</span>
      <div className="flex-1">
        {showBreadcrumb && parentContent && <div className="text-[11px] text-zinc-500 dark:text-zinc-300 mb-0.5">{parentContent} ▸</div>}
        <div className="text-sm text-zinc-900 dark:text-zinc-100">{task.content}</div>
        {task.childrenCount ? <span className="text-[10px] bg-zinc-100 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-200 px-1.5 py-0.5 rounded">{task.childrenCount}개</span> : null}
      </div>
      <span className={`text-xs px-1.5 py-0.5 rounded h-fit ${task.priority===4?"bg-red-100 dark:bg-red-950 text-red-600 dark:text-red-300": task.priority===3?"bg-orange-100 dark:bg-orange-950 text-orange-600 dark:text-orange-300":"bg-zinc-100 dark:bg-zinc-700 text-zinc-500 dark:text-zinc-200"}`}>P{task.priority}</span>
    </div>
  );
}

export default function App(){
  const [theme, setTheme] = useState(()=> localStorage.getItem("theme")||"light");
  const [tasks, setTasks] = useState([]);
  const [top3Ids, setTop3Ids] = useState(()=> JSON.parse(localStorage.getItem("top3_ids")||"[]"));
  const [logs, setLogs] = useState(()=> JSON.parse(localStorage.getItem("completed_logs")||"[]"));
  const [activeTab, setActiveTab] = useState("today");
  const [activeId, setActiveId] = useState(null);
  const [expanded, setExpanded] = useState(new Set(["1","2"]));
  const [newContent, setNewContent] = useState("");
  const [newPriority, setNewPriority] = useState(3);
  const [newParent, setNewParent] = useState("");
  const [token, setToken] = useState(()=> localStorage.getItem(TOKEN_KEY)||"");
  const [showToken, setShowToken] = useState(false);
  const [fetchStatus, setFetchStatus] = useState("idle");
  const [changelog, setChangelog] = useState([]);
  const [commits, setCommits] = useState([]);
  const [buildStatus, setBuildStatus] = useState("idle");
  const sensors = useSensors(useSensor(PointerSensor,{activationConstraint:{distance:8}}));
  const { setNodeRef: setTopRef, isOver: isTopOver } = useDroppable({ id: "top-container" });

  useEffect(()=>{ document.documentElement.classList.toggle("dark", theme==="dark"); localStorage.setItem("theme", theme); },[theme]);
  useEffect(()=> localStorage.setItem("top3_ids", JSON.stringify(top3Ids)), [top3Ids]);
  useEffect(()=> localStorage.setItem("completed_logs", JSON.stringify(logs)), [logs]);

  useEffect(()=>{
    if(activeTab!=="build") return;
    const base = import.meta.env.BASE_URL || "/Daily-Todo/";
    setBuildStatus("loading changelog.json");
    fetch(`${base}changelog.json?ts=${Date.now()}`)
      .then(async r=>{ if(!r.ok) throw new Error("no changelog"); return r.json(); })
      .then(data=>{ setChangelog(data); setBuildStatus(`changelog:${data.length}개 로드`); })
      .catch(()=>{
        setBuildStatus("fallback: commits API");
        fetch(`https://api.github.com/repos/${REPO}/commits?per_page=30`)
          .then(async r=>{ const t=await r.text(); if(!r.ok) throw new Error(t.slice(0,150)); return JSON.parse(t); })
          .then(d=>{ setCommits(d); setBuildStatus(`commits:${d.length}개`); })
          .catch(e=> setBuildStatus(`error:${e.message}`));
      });
  },[activeTab]);

  const fetchWithProxy = async (endpoint, options={}) => {
    const res = await fetch(`${PROXY}${endpoint}`, { ...options, headers: { Authorization: `Bearer ${token}`, "Content-Type":"application/json",...(options.headers||{}) } });
    if(!res.ok) { const txt=await res.text(); throw new Error(`HTTP ${res.status} ${txt.slice(0,200)}`); }
    return res.json();
  };

  const loadTodoist = async (tk = token) => {
    if(!tk){ setFetchStatus("no-token"); return; }
    try {
      setFetchStatus("loading...");
      const data = await fetch(`${PROXY}/tasks/filter?query=today%20%7C%20overdue`, { headers: { Authorization: `Bearer ${tk}` } })
        .then(async r=>{ const txt=await r.text(); if(!r.ok) throw new Error(`${r.status} ${txt.slice(0,300)}`); return JSON.parse(txt); });
      const results = data.results || [];
      const mapped = results.map(t=> ({ id: t.id, content: t.content, priority: t.priority||1, parent_id: t.parent_id||null }));
      setTasks(mapped);
      if(top3Ids.length===0){ setTop3Ids(mapped.filter(t=>!t.parent_id).slice(0,2).map(t=>t.id)); }
      setFetchStatus(`success:${mapped.length}개`);
    } catch(e){ setFetchStatus(`error:Load failed - ${e.message}`); }
  };

  useEffect(()=>{
    if(tasks.length===0 &&!token){
      const mock=[ {id:"1", content:"주간 피드백 정리", priority:4, parent_id:null}, {id:"1-1", content:"이메일 발송", priority:3, parent_id:"1"}, {id:"1-2", content:"데이터 정리", priority:2, parent_id:"1"}, {id:"2", content:"고객사 미팅 준비", priority:4, parent_id:null}, {id:"2-1", content:"이메일 발송", priority:3, parent_id:"2"}, {id:"3", content:"힐링코드 5분", priority:3, parent_id:null}, {id:"4", content:"운동 30분", priority:2, parent_id:null}, {id:"5", content:"아파트 관리비 내기", priority:1, parent_id:null}, ];
      setTasks(mock); if(top3Ids.length===0) setTop3Ids(["1","3"]);
    }
    if(token){ loadTodoist(token); }
  },[]);

  const taskMap = useMemo(()=> Object.fromEntries(tasks.map(t=>[t.id,t])), [tasks]);
  const tasksWithMeta = useMemo(()=> tasks.map(t=> ({ ...t, parentContent: t.parent_id? taskMap[t.parent_id]?.content : null, childrenCount: tasks.filter(c=>c.parent_id===t.id).length })), [tasks, taskMap]);
  const topTasks = useMemo(()=> top3Ids.map(id=> tasksWithMeta.find(t=>t.id===id)).filter(Boolean), [tasksWithMeta, top3Ids]);
  const rootTasks = useMemo(()=> tasksWithMeta.filter(t=>!t.parent_id), [tasksWithMeta]);
  const poolRoots = useMemo(()=> rootTasks.filter(t=>!top3Ids.includes(t.id)), [rootTasks, top3Ids]);

  const moveToTop = (id) => { if(top3Ids.includes(id)) return; if(top3Ids.length>=3){ alert("Top3는 최대 3개!"); return; } setTop3Ids(p=>[...p, id]); };

  const handleDragEnd = (e)=>{
    const {active, over} = e; setActiveId(null); if(!active) return;
    const aId = active.id; const inTop = top3Ids.includes(aId); const overId = over?.id;
    const overTop = overId==="top-container" || (overId && top3Ids.includes(overId)) || (isTopOver && !inTop);
    if(!inTop && overTop){ if(top3Ids.length>=3) return; setTop3Ids(p=> p.includes(aId) ? p : [...p, aId]); return; }
    if(inTop && !overTop && overId){ if(overId==="pool-container" || poolRoots.find(t=>t.id===overId)){ setTop3Ids(p=>p.filter(x=>x!==aId)); return; } }
    if(inTop && overTop && overId && top3Ids.includes(overId)){ const oi=top3Ids.indexOf(aId), ni=top3Ids.indexOf(overId); if(oi!==-1&&ni!==-1) setTop3Ids(arrayMove(top3Ids, oi, ni)); return; }
  };

  const completeTask = async (id)=>{
    const t = taskMap[id]; if(!t) return;
    if(token){ try{ await fetchWithProxy(`/tasks/${id}/close`, {method:"POST"}); }catch(e){} }
    const log={ id, content:t.content, parentContent: t.parent_id? taskMap[t.parent_id]?.content:null, completed_at:new Date().toISOString(), dateKey:new Date().toISOString().slice(0,10) };
    setLogs(p=>[log,...p]); setTasks(p=>p.filter(x=>x.id!==id && x.parent_id!==id)); setTop3Ids(p=>p.filter(x=>x!==id));
  };

  const deleteLocal = (id)=>{ setTasks(p=>p.filter(x=>x.id!==id && x.parent_id!==id)); setTop3Ids(p=>p.filter(x=>x!==id)); };

  const addTask = async ()=>{ if(!newContent.trim()) return; const newId=Date.now().toString(); const nt={ id:newId, content:newContent.trim(), priority:newPriority, parent_id:newParent||null }; if(token){ try{ const created=await fetchWithProxy(`/tasks`, {method:"POST", body: JSON.stringify({content: nt.content, priority: nt.priority, parent_id: nt.parent_id||undefined, due_string:"today"})}); nt.id=created.id||newId; }catch(e){} } setTasks(p=>[...p, nt]); setNewContent(""); setNewParent(""); };

  const groupedLogs = useMemo(()=>{ const g={}; logs.forEach(l=>{ if(!g[l.dateKey]) g[l.dateKey]=[]; g[l.dateKey].push(l); }); return Object.entries(g).sort((a,b)=> b[0].localeCompare(a[0])); },[logs]);

  return (
    <div className={theme}>
      <div className="min-h-screen bg-zinc-50 dark:bg-black flex justify-center">
        <div className="w-[430px] bg-white dark:bg-zinc-950 min-h-screen border-x border-zinc-200 dark:border-zinc-800 flex flex-col">
          <div className="sticky top-0 z-30 bg-white/90 dark:bg-zinc-950/90 backdrop-blur border-b border-zinc-200 dark:border-zinc-800 px-4 py-3 flex justify-between items-center" style={{paddingTop:'calc(12px + env(safe-area-inset-top))'}}>
            <span className="font-bold dark:text-white">Daily-Todo v1.16</span>
            <div className="flex gap-2">
              <button onClick={()=> setShowToken(!showToken)} className="w-9 h-9 rounded-full bg-zinc-100 dark:bg-zinc-800 dark:text-white flex items-center justify-center text-sm">⚙️</button>
              <button onClick={()=> setTheme(theme==="light"?"dark":"light")} className="w-9 h-9 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">{theme==="light"?"🌙":"☀️"}</button>
            </div>
          </div>
          {showToken && (
            <div className="mx-3 mt-3 p-3 rounded-xl border bg-yellow-50 dark:bg-zinc-900 dark:border-zinc-700 border-yellow-200">
              <div className="text-[12px] font-bold dark:text-white mb-2">Todoist 토큰</div>
              <div className="flex gap-2">
                <input value={token} onChange={e=>setToken(e.target.value)} type="password" placeholder="API token" className="flex-1 px-3 py-2 rounded-lg border text-sm text-black"/>
                <button onClick={()=>{ localStorage.setItem(TOKEN_KEY, token); setShowToken(false); loadTodoist(token); }} className="px-3 bg-black dark:bg-white text-white dark:text-black rounded-lg text-sm font-bold">저장 & 불러오기</button>
              </div>
              <div className="text-[11px] mt-2 dark:text-zinc-300 text-zinc-600">상태: {fetchStatus} | {PROXY}</div>
            </div>
          )}
          <div className="flex border-b border-zinc-200 dark:border-zinc-800 sticky top-[52px] z-20 bg-white dark:bg-zinc-950">
            <button onClick={()=>setActiveTab("today")} className={`flex-1 py-3 text-sm font-semibold ${activeTab==="today"?"text-black dark:text-white border-b-2 border-black dark:border-white":"text-zinc-400"}`}>오늘 할 일</button>
            <button onClick={()=>setActiveTab("history")} className={`flex-1 py-3 text-sm font-semibold ${activeTab==="history"?"text-black dark:text-white border-b-2 border-black dark:border-white":"text-zinc-400"}`}>날짜별 완료 ({logs.length})</button>
            <button onClick={()=>setActiveTab("build")} className={`flex-1 py-3 text-sm font-semibold ${activeTab==="build"?"text-black dark:text-white border-b-2 border-black dark:border-white":"text-zinc-400"}`}>빌드 히스토리</button>
          </div>
          <div className="bg-blue-600 dark:bg-blue-700 p-3 sticky top-[97px] z-10">
            <div className="flex gap-2">
              <input value={newContent} onChange={e=>setNewContent(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addTask()} placeholder="추가 업무 입력 + Enter" className="flex-1 px-3 py-2 rounded-lg text-sm outline-none text-black"/>
              <select value={newPriority} onChange={e=>setNewPriority(Number(e.target.value))} className="px-2 rounded-lg text-sm text-black"><option value={4}>P4</option><option value={3}>P3</option><option value={2}>P2</option><option value={1}>P1</option></select>
              <button onClick={addTask} className="px-3 bg-black text-white rounded-lg text-sm font-bold">추가</button>
            </div>
            <div className="flex gap-2 mt-2">
              <select value={newParent} onChange={e=>setNewParent(e.target.value)} className="flex-1 px-2 py-1 rounded text-xs text-black"><option value="">부모 없음 (최상위)</option>{rootTasks.map(r=><option key={r.id} value={r.id}>{r.content} 하위로</option>)}</select>
              <span className="text-[11px] text-blue-100 py-1">{fetchStatus}</span>
            </div>
          </div>
          {activeTab==="today" && (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={e=>setActiveId(e.active.id)} onDragEnd={handleDragEnd}>
              <div className="p-4 flex-1">
                <h2 className="font-bold text-sm mb-2 dark:text-white">지금 하는 3개 <span className="font-normal text-zinc-400">✓=Todoist완료+기록 / ✕=목록만 제외</span></h2>
                <SortableContext items={top3Ids} strategy={verticalListSortingStrategy}>
                  <div ref={setTopRef} id="top-container" className={`min-h-[160px] p-2 rounded-xl border-2 border-dashed mb-6 ${isTopOver? "bg-blue-50 dark:bg-blue-950 border-blue-400" : "bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700"}`}>
                    {topTasks.length===0 && <div className="text-center text-zinc-400 text-sm py-8">아래 ▲ 버튼이나 드래그로 올려보세요!</div>}
                    {topTasks.map(t=> {
                      const children = tasksWithMeta.filter(c=>c.parent_id===t.id);
                      return (
                        <div key={t.id}>
                          <div className="flex gap-2"><div className="flex-1"><SortableItem id={t.id} task={t} parentContent={t.parentContent} showBreadcrumb={!!t.parent_id}/></div><button onClick={()=>completeTask(t.id)} className="h-[46px] px-3 bg-black dark:bg-white text-white dark:text-black rounded-xl text-sm font-bold">✓</button><button onClick={()=>deleteLocal(t.id)} className="h-[46px] px-2 bg-zinc-200 dark:bg-zinc-800 dark:text-white rounded-xl text-xs">✕</button></div>
                          {children.length>0 && <div className="ml-6 border-l border-zinc-200 dark:border-zinc-700 pl-3 mb-3">{children.map(c=> (<div key={c.id} className="flex gap-2 items-center py-1"><button onClick={()=>completeTask(c.id)} className="w-5 h-5 border rounded flex items-center justify-center text-xs dark:text-zinc-200">□</button><span className="text-sm flex-1 dark:text-zinc-100">{c.content}</span><button onClick={()=>deleteLocal(c.id)} className="text-[11px] text-zinc-400 px-1">✕</button></div>))}</div>}
                        </div>
                      );
                    })}
                  </div>
                </SortableContext>
                <h2 className="font-bold text-sm mb-2 dark:text-white">오늘 풀 ({poolRoots.length})</h2>
                <SortableContext items={poolRoots.map(t=>t.id)} strategy={verticalListSortingStrategy}>
                  <div id="pool-container">{poolRoots.map(r=>{ const children = tasksWithMeta.filter(c=>c.parent_id===r.id); const isExp = expanded.has(r.id); return (<div key={r.id}><div className="flex gap-2"><div className="flex-1"><SortableItem id={r.id} task={r}/></div><button onClick={()=>moveToTop(r.id)} className="h-[46px] px-3 bg-blue-600 text-white rounded-xl text-sm font-bold">▲</button><button onClick={()=>setExpanded(s=>{const n=new Set(s); if(n.has(r.id)) n.delete(r.id); else n.add(r.id); return n;})} className="h-[46px] px-2 text-xs bg-zinc-100 dark:bg-zinc-800 dark:text-zinc-100 rounded-xl border">{isExp?"▲":"▼"} {children.length}</button><button onClick={()=>deleteLocal(r.id)} className="h-[46px] px-2 bg-zinc-100 dark:bg-zinc-800 dark:text-white rounded-xl text-xs">✕</button></div>{isExp && children.map(c=> (<div key={c.id} className="ml-6 flex gap-2"><div className="flex-1"><SortableItem id={c.id} task={c} parentContent={r.content} showBreadcrumb={false}/></div><button onClick={()=>moveToTop(c.id)} className="h-[46px] px-3 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-200 rounded-xl text-xs">▲ Top</button><button onClick={()=>deleteLocal(c.id)} className="h-[46px] px-2 bg-zinc-100 dark:bg-zinc-800 rounded-xl text-xs">✕</button></div>))}</div>); })}</div>
                </SortableContext>
              </div>
              <DragOverlay>{activeId? <div className="p-3 bg-white dark:bg-zinc-900 shadow-xl rounded-xl border text-sm dark:text-white">{taskMap[activeId]?.content}</div> : null}</DragOverlay>
            </DndContext>
          )}
          {activeTab==="history" && (<div className="p-4">{groupedLogs.length===0 && <div className="text-sm text-zinc-400">Top3에서 ✓ 누르면 여기 쌓임</div>}{groupedLogs.map(([date, items])=> (<div key={date} className="mb-6"><div className="font-semibold text-sm mb-2 dark:text-white">{date} · {items.length}개</div>{items.map((l,i)=>(<div key={i} className="p-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-900 border dark:border-zinc-800 mb-2 text-sm"><span className="text-green-600 mr-2">✓</span>{l.parentContent && <span className="text-[11px] text-zinc-500 dark:text-zinc-400">{l.parentContent} ▸ </span>}<span className="dark:text-zinc-200">{l.content}</span><span className="float-right text-xs text-zinc-400">{new Date(l.completed_at).toLocaleTimeString("ko-KR",{hour:"2-digit",minute:"2-digit"})}</span></div>))}</div>))}</div>)}
          {activeTab==="build" && (
            <div className="p-4 text-sm">
              <div className="flex justify-between items-center mb-3"><div className="font-bold dark:text-white">빌드 히스토리 - changelog.json 자동</div><div className="text-[11px] text-zinc-400">{buildStatus}</div></div>
              {changelog.length>0 ? changelog.map(b=>(
                <div key={b.version} className="border-l-2 border-zinc-200 dark:border-zinc-700 pl-3 py-2 mb-4">
                  <div className="flex gap-2 items-center"><span className="font-bold dark:text-white">{b.version}</span><span className={`text-xs px-1.5 rounded ${b.status==="현재"?"bg-blue-100 text-blue-600":"bg-zinc-100 dark:bg-zinc-800 dark:text-zinc-200"}`}>{b.status}</span><span className="text-xs text-zinc-400">{b.date}</span></div>
                  <ul className="mt-2 list-disc list-inside text-[13px] text-zinc-700 dark:text-zinc-300 space-y-1">{b.changes.map((c,i)=><li key={i}>{c}</li>)}</ul>
                </div>
              )) : commits.map(c=>(
                <div key={c.sha} className="border-l-2 border-zinc-200 dark:border-zinc-700 pl-3 py-2 mb-2"><div className="flex gap-2"><span className="font-bold dark:text-white text-xs">{c.sha.slice(0,7)}</span><span className="text-xs text-zinc-400">{new Date(c.commit.author.date).toLocaleDateString("ko-KR")}</span></div><div className="text-zinc-600 dark:text-zinc-300 mt-1 whitespace-pre-wrap text-[13px]">{c.commit.message}</div></div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
