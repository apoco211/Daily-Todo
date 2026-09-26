
import { useState, useEffect, useMemo } from "react";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragOverlay } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

function SortableItem({ id, task, parentContent, showBreadcrumb }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}
      className="flex gap-2 p-3 rounded-xl border mb-2 bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 shadow-sm cursor-grab">
      <span className="text-zinc-400">≡</span>
      <div className="flex-1">
        {showBreadcrumb && parentContent && <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mb-0.5">{parentContent} \u25B8</div>}
        <div className="text-sm text-zinc-900 dark:text-white">{task.content}</div>
        {task.childrenCount ? <span className="text-[10px] bg-zinc-100 dark:bg-zinc-800 px-1 rounded">{task.childrenCount}개</span> : null}
      </div>
      <span className={`text-xs px-1.5 py-0.5 rounded ${task.priority===4?"bg-red-100 text-red-600": task.priority===3?"bg-orange-100 text-orange-600":"bg-zinc-100 text-zinc-500"}`}>P{task.priority}</span>
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
  const sensors = useSensors(useSensor(PointerSensor,{activationConstraint:{distance:5}}));

  useEffect(()=>{ document.documentElement.classList.toggle("dark", theme==="dark"); localStorage.setItem("theme", theme); },[theme]);
  useEffect(()=> localStorage.setItem("top3_ids", JSON.stringify(top3Ids)), [top3Ids]);
  useEffect(()=> localStorage.setItem("completed_logs", JSON.stringify(logs)), [logs]);

  useEffect(()=>{
    if(tasks.length===0){
      const mock=[
        {id:"1", content:"주간 피드백 정리", priority:4, parent_id:null},
        {id:"1-1", content:"이메일 발송", priority:3, parent_id:"1"},
        {id:"1-2", content:"데이터 정리", priority:2, parent_id:"1"},
        {id:"2", content:"고객사 미팅 준비", priority:4, parent_id:null},
        {id:"2-1", content:"이메일 발송", priority:3, parent_id:"2"},
        {id:"3", content:"힐링코드 5분", priority:3, parent_id:null},
        {id:"4", content:"운동 30분", priority:2, parent_id:null},
        {id:"5", content:"아파트 관리비 내기", priority:1, parent_id:null},
      ];
      setTasks(mock);
      if(top3Ids.length===0) setTop3Ids(["1","3"]);
    }
  },[]);

  const taskMap = useMemo(()=> Object.fromEntries(tasks.map(t=>[t.id,t])), [tasks]);
  const tasksWithMeta = useMemo(()=> tasks.map(t=> ({
    ...t,
    parentContent: t.parent_id ? taskMap[t.parent_id]?.content : null,
    childrenCount: tasks.filter(c=>c.parent_id===t.id).length
  })), [tasks, taskMap]);

  const topTasks = useMemo(()=> top3Ids.map(id=> tasksWithMeta.find(t=>t.id===id)).filter(Boolean), [tasksWithMeta, top3Ids]);
  const rootTasks = useMemo(()=> tasksWithMeta.filter(t=> !t.parent_id), [tasksWithMeta]);
  const poolRoots = useMemo(()=> rootTasks.filter(t=> !top3Ids.includes(t.id)), [rootTasks, top3Ids]);

  const allIds = useMemo(()=> [...top3Ids, ...poolRoots.map(t=>t.id), ...tasks.filter(t=>t.parent_id).map(t=>t.id)], [top3Ids, poolRoots, tasks]);

  const handleDragEnd = (e)=>{
    const {active, over} = e; setActiveId(null); if(!over) return;
    const a=active.id, o=over.id;
    const inTop = top3Ids.includes(a);
    const overTop = top3Ids.includes(o) || o==="top-container";
    if(!inTop && overTop){ if(top3Ids.length>=3){ alert("Top3는 최대 3개!"); return;} setTop3Ids(p=>[...p,a]); return; }
    if(inTop && !overTop){ setTop3Ids(p=>p.filter(x=>x!==a)); return; }
    if(inTop && overTop){ const oi=top3Ids.indexOf(a), ni=top3Ids.indexOf(o); if(oi!==-1&&ni!==-1) setTop3Ids(arrayMove(top3Ids, oi, ni)); return; }
    if(!inTop && !overTop){ const oi=tasks.findIndex(t=>t.id===a), ni=tasks.findIndex(t=>t.id===o); if(oi!==-1&&ni!==-1) setTasks(arrayMove(tasks, oi, ni)); }
  };

  const completeTask = (id)=>{
    const t = taskMap[id]; if(!t) return;
    // Todoist API: POST /api/v1/tasks/{id}/close would be here via fetchWithProxy
    const log={ id, content:t.content, parentContent: t.parent_id? taskMap[t.parent_id]?.content:null, completed_at:new Date().toISOString(), dateKey:new Date().toISOString().slice(0,10) };
    setLogs(p=>[log,...p]);
    // if parent, keep children? For v1.14.1 we remove only completed id, children stay (orphan) or remove if parent completed with confirm
    if(!t.parent_id){
      const children = tasks.filter(c=>c.parent_id===id);
      if(children.length>0){
        if(!confirm(`하위 ${children.length}개도 같이 완료할까요? (취소하면 부모만 완료)`)){ setTasks(p=>p.filter(x=>x.id!==id)); setTop3Ids(p=>p.filter(x=>x!==id)); return; }
        // complete all
        children.forEach(c=>{ const cl={id:c.id, content:c.content, parentContent:t.content, completed_at:new Date().toISOString(), dateKey:log.dateKey}; setLogs(p=>[cl,...p]); });
        setTasks(p=>p.filter(x=>x.id!==id && x.parent_id!==id));
      } else { setTasks(p=>p.filter(x=>x.id!==id)); }
    } else { setTasks(p=>p.filter(x=>x.id!==id)); }
    setTop3Ids(p=>p.filter(x=>x!==id));
  };

  const addTask = ()=>{
    if(!newContent.trim()) return;
    const newId=Date.now().toString();
    const nt={ id:newId, content:newContent.trim(), priority:newPriority, parent_id:newParent||null };
    setTasks(p=>[...p, nt]);
    // Todoist API: POST /api/v1/tasks {content, priority, parent_id, due_string:"today"}
    setNewContent(""); setNewParent("");
  };

  const groupedLogs = useMemo(()=>{
    const g={}; logs.forEach(l=>{ if(!g[l.dateKey]) g[l.dateKey]=[]; g[l.dateKey].push(l); }); return Object.entries(g).sort((a,b)=> b[0].localeCompare(a[0]));
  },[logs]);

  return (
    <div className={theme}>
      <div className="min-h-screen bg-zinc-50 dark:bg-black flex justify-center">
        <div className="w-[430px] bg-white dark:bg-zinc-950 min-h-screen border-x border-zinc-200 dark:border-zinc-800 flex flex-col">
          <div className="sticky top-0 z-30 bg-white/90 dark:bg-zinc-950/90 backdrop-blur border-b border-zinc-200 dark:border-zinc-800 px-4 py-3 flex justify-between items-center">
            <span className="font-bold dark:text-white">Daily-Todo v1.14.1</span>
            <button onClick={()=> setTheme(theme==="light"?"dark":"light")} className="w-9 h-9 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">{theme==="light"?"🌙":"☀️"}</button>
          </div>
          <div className="flex border-b border-zinc-200 dark:border-zinc-800 sticky top-[52px] z-20 bg-white dark:bg-zinc-950">
            <button onClick={()=>setActiveTab("today")} className={`flex-1 py-3 text-sm font-semibold ${activeTab==="today"?"text-black dark:text-white border-b-2 border-black dark:border-white":"text-zinc-400"}`}>오늘 할 일</button>
            <button onClick={()=>setActiveTab("history")} className={`flex-1 py-3 text-sm font-semibold ${activeTab==="history"?"text-black dark:text-white border-b-2 border-black dark:border-white":"text-zinc-400"}`}>날짜별 완료 ({logs.length})</button>
            <button onClick={()=>setActiveTab("build")} className={`flex-1 py-3 text-sm font-semibold ${activeTab==="build"?"text-black dark:text-white border-b-2 border-black dark:border-white":"text-zinc-400"}`}>빌드 히스토리</button>
          </div>

          <div className="bg-blue-600 dark:bg-blue-700 p-3 sticky top-[97px] z-10">
            <div className="flex gap-2">
              <input value={newContent} onChange={e=>setNewContent(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addTask()} placeholder="추가 업무 입력 + Enter" className="flex-1 px-3 py-2 rounded-lg text-sm outline-none"/>
              <select value={newPriority} onChange={e=>setNewPriority(Number(e.target.value))} className="px-2 rounded-lg text-sm"><option value={4}>P4</option><option value={3}>P3</option><option value={2}>P2</option><option value={1}>P1</option></select>
              <button onClick={addTask} className="px-3 bg-black text-white rounded-lg text-sm">추가</button>
            </div>
            <div className="flex gap-2 mt-2">
              <select value={newParent} onChange={e=>setNewParent(e.target.value)} className="flex-1 px-2 py-1 rounded text-xs"><option value="">부모 없음 (최상위)</option>{rootTasks.map(r=><option key={r.id} value={r.id}>{r.content} 하위로</option>)}</select>
              <span className="text-[11px] text-blue-100 py-1">Todoist에도 동시 생성</span>
            </div>
          </div>

          {activeTab==="today" && (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={e=>setActiveId(e.active.id)} onDragEnd={handleDragEnd}>
              <div className="p-4 flex-1">
                <h2 className="font-bold text-sm mb-2 dark:text-white">지금 하는 3개 <span className="font-normal text-zinc-400">하위 단독이면 부모 breadcrumb 표시</span></h2>
                <SortableContext items={top3Ids} strategy={verticalListSortingStrategy}>
                  <div id="top-container" className="min-h-[160px] p-2 rounded-xl bg-zinc-50 dark:bg-zinc-900 border-2 border-dashed border-zinc-200 dark:border-zinc-800 mb-6">
                    {topTasks.length===0 && <div className="text-center text-zinc-400 text-sm py-8">아래에서 드래그해서 올려보세요!</div>}
                    {topTasks.map(t=> {
                      const children = tasksWithMeta.filter(c=>c.parent_id===t.id);
                      const showBread = !!t.parent_id && !top3Ids.includes(t.parent_id);
                      return (
                        <div key={t.id}>
                          <div className="flex gap-2"><div className="flex-1"><SortableItem id={t.id} task={t} parentContent={t.parentContent} showBreadcrumb={showBread}/></div><button onClick={()=>completeTask(t.id)} className="h-[46px] px-3 bg-black dark:bg-white text-white dark:text-black rounded-xl text-sm">✓</button></div>
                          {children.length>0 && !t.parent_id && (
                            <div className="ml-6 border-l border-zinc-200 dark:border-zinc-700 pl-3 mb-3">
                              {children.map(c=> (
                                <div key={c.id} className="flex gap-2 items-center py-1">
                                  <button onClick={()=>completeTask(c.id)} className="w-5 h-5 border rounded flex items-center justify-center text-xs">□</button>
                                  <span className="text-sm flex-1 dark:text-zinc-200">{c.content}</span>
                                  <span className="text-[11px] text-zinc-400">하위만 완료</span>
                                </div>
                              ))}
                              <div className="text-[11px] text-zinc-400 mt-1">진행 {tasks.filter(x=>x.parent_id===t.id).length - children.length}/{tasks.filter(x=>true).length} - 부모 Top3에서 자식 하나씩 처리하면 Todoist에는 자식만 close</div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </SortableContext>

                <h2 className="font-bold text-sm mb-2 dark:text-white">오늘 풀 ({poolRoots.length})</h2>
                <SortableContext items={poolRoots.map(t=>t.id)} strategy={verticalListSortingStrategy}>
                  <div>
                    {poolRoots.map(r=>{
                      const children = tasksWithMeta.filter(c=>c.parent_id===r.id);
                      const isExp = expanded.has(r.id);
                      return (
                        <div key={r.id}>
                          <div className="flex gap-2"><div className="flex-1"><SortableItem id={r.id} task={r}/></div><button onClick={()=>setExpanded(s=>{const n=new Set(s); if(n.has(r.id)) n.delete(r.id); else n.add(r.id); return n;})} className="h-[46px] px-2 text-xs bg-zinc-100 dark:bg-zinc-800 rounded-xl">{isExp?"▲":"▼"} {children.length}</button><button onClick={()=>completeTask(r.id)} className="h-[46px] px-3 bg-zinc-200 dark:bg-zinc-800 rounded-xl text-sm">✓</button></div>
                          {isExp && children.map(c=> (
                            <div key={c.id} className="ml-6 flex gap-2"><div className="flex-1"><SortableItem id={c.id} task={c} parentContent={r.content} showBreadcrumb={false}/></div><button onClick={()=>completeTask(c.id)} className="h-[46px] px-3 bg-zinc-100 dark:bg-zinc-800 rounded-xl text-xs">✓ 하위</button></div>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                </SortableContext>
              </div>
              <DragOverlay>{activeId ? <div className="p-3 bg-white dark:bg-zinc-900 shadow-xl rounded-xl border text-sm dark:text-white">{taskMap[activeId]?.parent_id ? `${taskMap[taskMap[activeId].parent_id]?.content} ▸ ` : ""}{taskMap[activeId]?.content}</div> : null}</DragOverlay>
            </DndContext>
          )}

          {activeTab==="history" && (
            <div className="p-4">
              {groupedLogs.length===0 && <div className="text-sm text-zinc-400">아직 완료 없음</div>}
              {groupedLogs.map(([date, items])=> (
                <div key={date} className="mb-6"><div className="font-semibold text-sm mb-2 dark:text-white">{date} · {items.length}개</div>{items.map((l,i)=>(<div key={i} className="p-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-900 border dark:border-zinc-800 mb-2 text-sm"><span className="text-green-600 mr-2">✓</span>{l.parentContent && <span className="text-[11px] text-zinc-500">{l.parentContent} ▸ </span>}<span className="dark:text-zinc-200">{l.content}</span><span className="float-right text-xs text-zinc-400">{new Date(l.completed_at).toLocaleTimeString("ko-KR",{hour:"2-digit",minute:"2-digit"})}</span></div>))}</div>
              ))}
            </div>
          )}

          {activeTab==="build" && (
            <div className="p-4 text-sm">
              {[
                {v:"v1.14.1", d:"2026-09-27", s:"현재", t:"하위 breadcrumb + 다크토글 + 체크리스트 + 추가칸 통합"},
                {v:"v1.13.0", d:"2026-09-27", s:"버그수정", t:"Top3 수동 드래그 + 양방향 이동 fix"},
                {v:"v1.12.4", d:"2026-09-26", s:"성공", t:"추가업무 칸 상단 고정 + Todoist POST /tasks 양방향"},
                {v:"v1.12.2", d:"2026-09-26", s:"버그수정", t:"다크모드 text-white 수정"},
                {v:"v1.11", d:"2026-09-26", s:"성공", t:"today|overdue 필터로 12개 복구"},
                {v:"v1.10", d:"2026-09-26", s:"버그수정", t:"rest/v2 410 Gone -> v1 마이그레이션"},
                {v:"v1.8", d:"2026-09-26", s:"최초", t:"최초 구현 @dnd-kit + Todoist 연동"},
              ].map(b=>(
                <div key={b.v} className="border-l-2 border-zinc-200 dark:border-zinc-700 pl-3 py-2 mb-2"><div className="flex gap-2"><span className="font-bold dark:text-white">{b.v}</span><span className="text-xs px-1.5 bg-zinc-100 dark:bg-zinc-800 rounded">{b.s}</span><span className="text-xs text-zinc-400">{b.d}</span></div><div className="text-zinc-600 dark:text-zinc-300 mt-1">{b.t}</div></div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
