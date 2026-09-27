import { useState, useEffect, useMemo } from "react"
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, useDroppable } from "@dnd-kit/core"
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"

const PROXY = "https://todoist-proxy.apoco211.workers.dev"
const VERSION = "v1.17.4"

function getRootId(task, taskMap) {
  if (!task) return null
  let cur = task
  const visited = new Set()
  while (cur?.parent_id && taskMap[cur.parent_id] &&!visited.has(cur.parent_id)) {
    visited.add(cur.id)
    cur = taskMap[cur.parent_id]
  }
  return cur?.id || task.id
}

function SortableItem({ task, parentContent, isTop, isCandidate, hasChildren, expanded, onToggle, onMoveTop, onMoveDown, onComplete, onDelete, childrenList }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging? 0.5 : 1 }
  let base = "rounded-lg p-2.5 flex flex-col gap-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
  if (isTop) base = "rounded-lg p-2.5 flex flex-col gap-1 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700"
  if (isCandidate) base = "rounded-lg p-2.5 flex flex-col gap-1 bg-amber-50/80 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/40"
  return (
    <div ref={setNodeRef} style={style} className={base}>
      <div className="flex items-center gap-1.5">
        <button {...attributes} {...listeners} className="text-gray-300 dark:text-gray-600 cursor-grab text-[12px]">≡</button>
        <div className="flex-1 min-w-0">
          {parentContent && <div className="text-[10px] text-gray-500 dark:text-gray-400 leading-none mb-0.5 truncate">{parentContent} ▸</div>}
          <div className="text-[13px] leading-tight text-gray-900 dark:text-gray-100 truncate">{task.content}</div>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          {task.priority>1 && <span className={`text-[9px] px-1 py-0.5 rounded font-bold ${task.priority===4?'bg-red-500 text-white':task.priority===3?'bg-orange-400 text-white':'bg-blue-400 text-white'}`}>P{task.priority}</span>}
          {hasChildren && <span className="text-[9px] px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-700 dark:text-gray-300">{childrenList?.length}</span>}
          {!isTop? (<><button onClick={()=>onMoveTop(task.id)} className="w-6 h-6 bg-blue-500 text-white rounded-md text-[11px] font-bold">▲</button>{hasChildren && <button onClick={()=>onToggle(task.id)} className="w-6 h-6 bg-gray-100 dark:bg-gray-700 dark:text-gray-200 rounded-md text-[10px]">{expanded?'▲':'▼'}</button>}<button onClick={()=>onDelete(task.id)} className="w-6 h-6 bg-gray-100 dark:bg-gray-700 dark:text-gray-300 rounded-md text-[10px]">✕</button></>) : (<><button onClick={()=>onComplete(task.id)} className="w-6 h-6 bg-black dark:bg-white text-white dark:text-black rounded-md text-[11px] font-bold">✓</button><button onClick={()=>onMoveDown(task.id)} className="w-6 h-6 bg-gray-100 dark:bg-gray-700 dark:text-gray-300 rounded-md text-[10px]">▼</button></>)}
        </div>
      </div>
      {!isTop && expanded && childrenList?.length>0 && (
        <div className="ml-5 pl-2.5 border-l border-gray-200 dark:border-gray-700 flex flex-col gap-1">
          {childrenList.map(child=>(
            <div key={child.id} className="flex items-center justify-between py-1">
              <div className="min-w-0 flex-1"><div className="text-[10px] text-gray-400 dark:text-gray-500 truncate">{task.content} ▸</div><div className="text-[12px] text-gray-800 dark:text-gray-200 truncate">{child.content}</div></div>
              <div className="flex gap-0.5 ml-2"><button onClick={()=>onMoveTop(child.id)} className="w-5 h-5 bg-blue-500 text-white rounded text-[9px]">▲</button><button onClick={()=>onDelete(child.id)} className="w-5 h-5 bg-gray-100 dark:bg-gray-700 rounded text-[9px]">✕</button></div>
            </div>
          ))}
        </div>
      )}
      {isTop && childrenList?.length>0 && (
        <div className="ml-4 pl-2.5 border-l border-blue-200 dark:border-blue-700 flex flex-col gap-0.5">
          <div className="text-[9px] text-gray-500 dark:text-gray-400">{childrenList.length}개 하위</div>
          {childrenList.map(ch=><div key={ch.id} className="text-[11px] text-gray-700 dark:text-gray-300 truncate">• {ch.content}</div>)}
        </div>
      )}
    </div>
  )
}

function TopDrop({ children }) {
  const { setNodeRef, isOver } = useDroppable({ id: "top-container" })
  return <div ref={setNodeRef} className={`rounded-xl border-2 border-dashed p-2 min-h-[130px] ${isOver?'border-blue-400 bg-blue-50/30':'border-gray-300 dark:border-gray-600'}`}>{children}</div>
}

export default function App() {
  const [tasks, setTasks] = useState([])
  const [top3Ids, setTop3Ids] = useState(()=>JSON.parse(localStorage.getItem("top3Ids")||"[]"))
  const [logs, setLogs] = useState(()=>JSON.parse(localStorage.getItem("completed_logs")||"[]"))
  const [token, setToken] = useState(()=>localStorage.getItem("todoist_token")||"")
  const [activeTab, setActiveTab] = useState("today")
  const [expandedIds, setExpandedIds] = useState(new Set())
  const [dark, setDark] = useState(()=>localStorage.getItem("dark")==="true")
  const [newContent, setNewContent] = useState("")
  const [newPri, setNewPri] = useState(1)
  const [newParent, setNewParent] = useState("")
  const [showToken, setShowToken] = useState(false)
  const [tmpToken, setTmpToken] = useState(token)
  const [completedFromTodoist, setCompletedFromTodoist] = useState([])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))
  const taskMap = useMemo(()=>{ const m={}; tasks.forEach(t=>m[t.id]=t); return m }, [tasks])
  useEffect(()=>{ localStorage.setItem("top3Ids", JSON.stringify(top3Ids)) }, [top3Ids])
  useEffect(()=>{ localStorage.setItem("completed_logs", JSON.stringify(logs)) }, [logs])
  useEffect(()=>{ localStorage.setItem("dark", String(dark)); if(dark) document.documentElement.classList.add("dark"); else document.documentElement.classList.remove("dark") }, [dark])
  const getChildren = (parentId) => tasks.filter(t=>t.parent_id===parentId)

  const fetchTasks = async () => {
    if(!token) { alert("토큰 먼저 저장해줘"); return }
    try{
      const res = await fetch(`${PROXY}/api/v1/tasks/filter?query=today%20|%20overdue`, { headers: { Authorization: `Bearer ${token}` } })
      const data = await res.json()
      const todays = data.results || data.tasks || data || []
      const childResults = await Promise.all(todays.map(async (t)=>{
        try{
          const r = await fetch(`${PROXY}/api/v1/tasks?parent_id=${t.id}`, { headers: { Authorization: `Bearer ${token}` } })
          const d = await r.json()
          return d.results || d.tasks || (Array.isArray(d)? d : [])
        }catch{ return [] }
      }))
      const allChildren = childResults.flat()
      const mergedMap = {}
      ;[...todays,...allChildren].forEach(t=>{ mergedMap[t.id]=t })
      setTasks(Object.values(mergedMap))
    }catch(e){ console.error(e); alert("불러오기 실패 - 토큰 확인") }
  }

  const fetchCompleted = async () => {
    if(!token) return
    try{
      const since = new Date(Date.now()-7*86400000).toISOString()
      const res = await fetch(`${PROXY}/api/v1/completed/get_all?since=${encodeURIComponent(since)}&limit=100`, { headers: { Authorization: `Bearer ${token}` } })
      const data = await res.json()
      setCompletedFromTodoist(data.items || [])
    }catch{ setCompletedFromTodoist([]) }
  }

  useEffect(()=>{ if(token) fetchTasks() }, [token])
  useEffect(()=>{ if(activeTab==="history") fetchCompleted() }, [activeTab])

  const getTop3GroupCount = () => { const s=new Set(); top3Ids.forEach(id=>{ const t=taskMap[id]; if(t) s.add(getRootId(t, taskMap)) }); return s.size }
  const moveToTop = (id) => {
    const t=taskMap[id]; if(!t) return
    const root=getRootId(t, taskMap)
    const existing=new Set(top3Ids.map(tid=>taskMap[tid]?getRootId(taskMap[tid], taskMap):null).filter(Boolean))
    if(existing.has(root)) return
    if(getTop3GroupCount()>=3){ alert("Top3는 최대 3개!"); return }
    setTop3Ids(p=>[...p,id])
  }
  const moveDown = (id) => setTop3Ids(p=>p.filter(t=>t!==id))
  const deleteLocal = (id) => {
    const toRemove=new Set([id])
    tasks.forEach(t=>{ if(t.parent_id===id) toRemove.add(t.id) })
    setTasks(p=>p.filter(t=>!toRemove.has(t.id)))
    setTop3Ids(p=>p.filter(t=>!toRemove.has(t)))
  }
  const completeTask = async (id) => {
    const t=taskMap[id]; if(!t) return
    const toComplete=[t,...getChildren(id)]
    try{ for(const c of toComplete){ await fetch(`${PROXY}/api/v1/tasks/${c.id}/close`, { method:"POST", headers:{ Authorization:`Bearer ${token}` } }) } }catch{}
    const now=new Date(); const dateKey=now.toISOString().slice(0,10)
    setLogs(p=>[...toComplete.map(x=>({ id:x.id, content:x.content, completedAt:now.toISOString(), dateKey })),...p])
    const rem=new Set(toComplete.map(x=>x.id))
    setTasks(p=>p.filter(x=>!rem.has(x.id)))
    setTop3Ids(p=>p.filter(x=>!rem.has(x)))
  }
  const addTask = async () => {
    if(!newContent.trim()) return
    try{
      const res=await fetch(`${PROXY}/api/v1/tasks`, { method:"POST", headers:{ "Content-Type":"application/json", Authorization:`Bearer ${token}` }, body: JSON.stringify({ content:newContent, priority:newPri, parent_id:newParent||undefined }) })
      const created=await res.json()
      setTasks(p=>[created,...p]); setNewContent(""); setNewParent("")
    }catch{ alert("추가 실패") }
  }

  const topRoots=useMemo(()=>{ const s=new Set(); top3Ids.forEach(id=>{ const t=taskMap[id]; if(t) s.add(getRootId(t, taskMap)) }); return s }, [top3Ids, taskMap])
  const poolTasks=useMemo(()=>tasks.filter(t=>{
    const root=getRootId(t, taskMap)
    if(topRoots.has(root)) return false
    if(t.parent_id && taskMap[t.parent_id]) return false
    return true
  }), [tasks, topRoots, taskMap])

  const handleDragEnd = (e) => {
    const { active, over } = e; if(!over) return
    if(over.id==="top-container"){ moveToTop(active.id); return }
    if(poolTasks.find(t=>t.id===active.id) && poolTasks.find(t=>t.id===over.id)){
      const oldIdx=poolTasks.findIndex(t=>t.id===active.id)
      const newIdx=poolTasks.findIndex(t=>t.id===over.id)
      const newPool=arrayMove(poolTasks, oldIdx, newIdx)
      const other=tasks.filter(t=>!poolTasks.find(p=>p.id===t.id))
      let rebuilt=[]; newPool.forEach(p=>{ rebuilt.push(p); getChildren(p.id).forEach(c=>rebuilt.push(c)) })
      setTasks([...rebuilt,...other.filter(o=>!rebuilt.find(r=>r.id===o.id))])
      return
    }
    if(top3Ids.includes(active.id) && top3Ids.includes(over.id)){
      setTop3Ids(prev=>arrayMove(prev, top3Ids.indexOf(active.id), top3Ids.indexOf(over.id)))
    }
  }

  const groupedLogs=useMemo(()=>{
    const all=[...logs]
    completedFromTodoist.forEach(c=>{ const dk=(c.completed_at||"").slice(0,10); if(dk) all.push({ id:c.task_id||c.id, content:c.content, completedAt:c.completed_at, dateKey:dk, fromTodoist:true }) })
    const map=new Map(); all.forEach(l=>{ const k=l.id+"_"+l.dateKey; if(!map.has(k)) map.set(k,l) })
    const arr=Array.from(map.values()).sort((a,b)=>new Date(b.completedAt)-new Date(a.completedAt))
    const grouped={}; arr.forEach(l=>{ if(!grouped[l.dateKey]) grouped[l.dateKey]=[]; grouped[l.dateKey].push(l) })
    return Object.entries(grouped).sort((a,b)=>b[0].localeCompare(a[0]))
  }, [logs, completedFromTodoist])

  return (
    <div className={`min-h-screen bg-gray-50 dark:bg-gray-950 flex justify-center ${dark?'dark':''}`}>
      <div className="w-full max-w-[430px] bg-white dark:bg-gray-900 min-h-screen shadow-xl flex flex-col" style={{paddingTop:"env(safe-area-inset-top)"}}>
        <header className="flex justify-between items-center px-3 py-2.5 border-b dark:border-gray-800">
          <div className="font-bold text-[14px] text-gray-900 dark:text-white">{VERSION}</div>
          <div className="flex gap-1.5"><button onClick={()=>setShowToken(!showToken)} className="w-7 h-7 rounded-full bg-gray-100 dark:bg-gray-800 dark:text-white text-[12px]">⚙️</button><button onClick={()=>setDark(!dark)} className="w-7 h-7 rounded-full bg-gray-100 dark:bg-gray-800 dark:text-white text-[12px]">{dark?'☀️':'🌙'}</button></div>
        </header>
        {showToken && (
          <div className="p-2.5 bg-gray-50 dark:bg-gray-800 border-b dark:border-gray-700 flex flex-col gap-2">
            <div className="flex gap-1.5">
              <input type="password" value={tmpToken} onChange={e=>setTmpToken(e.target.value)} placeholder="Todoist API 토큰 (가려짐)" className="flex-1 px-2.5 py-1.5 rounded-lg border text-[11px] dark:bg-gray-700 dark:text-white dark:border-gray-600" />
              <button onClick={async ()=>{ localStorage.setItem("todoist_token", tmpToken); setToken(tmpToken); setShowToken(false); setTimeout(()=>fetchTasks(), 200) }} className="bg-black dark:bg-white text-white dark:text-black px-3 rounded-lg text-[11px] font-bold">저장&불러오기</button>
            </div>
            <div className="flex gap-1.5">
              <button onClick={()=>fetchTasks()} className="flex-1 bg-blue-500 text-white py-1.5 rounded-lg text-[11px]">🔄 다시 불러오기</button>
              <button onClick={()=>{ setTmpToken(""); localStorage.removeItem("todoist_token"); setToken(""); setTasks([]) }} className="flex-1 bg-gray-200 dark:bg-gray-700 dark:text-white py-1.5 rounded-lg text-[11px]">토큰 삭제</button>
            </div>
            <div className="text-[10px] text-gray-400 dark:text-gray-500">* 토큰은 브라우저에만 저장, 서버 전송 안 함. 저장하면 바로 목록 불러옵니다.</div>
          </div>
        )}
        <div className="flex border-b dark:border-gray-800">{["today","history","changelog"].map(tab=><button key={tab} onClick={()=>setActiveTab(tab)} className={`flex-1 py-2 text-[12px] ${activeTab===tab?'border-b-2 border-black dark:border-white font-bold text-gray-900 dark:text-white':'text-gray-500 dark:text-gray-400'}`}>{tab==="today"?"오늘 할 일":tab==="history"?"날짜별 완료":"히스토리"}</button>)}</div>
        {activeTab==="today" && <div className="flex-1 overflow-auto p-2 flex flex-col gap-3">
          <div className="flex gap-1.5">
            <input value={newContent} onChange={e=>setNewContent(e.target.value)} placeholder="추가업무" className="flex-1 px-2.5 py-2 rounded-lg border bg-blue-50/50 dark:bg-gray-800 border-blue-100 dark:border-gray-700 text-[13px] text-gray-900 dark:text-white placeholder-gray-400" />
            <select value={newPri} onChange={e=>setNewPri(Number(e.target.value))} className="px-1.5 rounded-lg border text-[11px] dark:bg-gray-800 dark:text-white"><option value={1}>P4</option><option value={2}>P3</option><option value={3}>P2</option><option value={4}>P1</option></select>
            <select value={newParent} onChange={e=>setNewParent(e.target.value)} className="px-1.5 rounded-lg border text-[11px] dark:bg-gray-800 dark:text-white max-w-[70px]"><option value="">부모없음</option>{tasks.filter(t=>!t.parent_id).map(t=><option key={t.id} value={t.id}>{t.content.slice(0,10)}</option>)}</select>
            <button onClick={addTask} className="bg-blue-500 text-white px-2.5 rounded-lg text-[13px]">+</button>
          </div>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <div className="flex flex-col gap-1.5"><div className="text-[12px] font-bold text-gray-800 dark:text-gray-200">🎯 Top3 ({getTop3GroupCount()}/3)</div><TopDrop>{top3Ids.length===0? <div className="text-center text-gray-400 dark:text-gray-500 text-[12px] py-6">▲로 올리기</div> : <SortableContext items={top3Ids} strategy={verticalListSortingStrategy}><div className="flex flex-col gap-1.5">{top3Ids.map(id=>{ const t=taskMap[id]; if(!t) return null; const children=getChildren(id); return <SortableItem key={id} task={t} isTop={true} hasChildren={children.length>0} childrenList={children} onComplete={completeTask} onMoveDown={moveDown} onDelete={deleteLocal} /> })}</div></SortableContext>}</TopDrop></div>
            <div className="flex flex-col gap-1.5 mt-1"><div className="text-[12px] font-bold text-gray-800 dark:text-gray-200">📋 오늘 풀 ({poolTasks.length})</div><SortableContext items={poolTasks.map(t=>t.id)} strategy={verticalListSortingStrategy}><div className="flex flex-col gap-1.5">{poolTasks.map((t, idx)=>{ const children=getChildren(t.id); const isCandidate=idx<3; const expanded=expandedIds.has(t.id); return <SortableItem key={t.id} task={t} isCandidate={isCandidate} hasChildren={children.length>0} expanded={expanded} childrenList={children} onToggle={(pid)=>setExpandedIds(prev=>{ const n=new Set(prev); if(n.has(pid)) n.delete(pid); else n.add(pid); return n })} onMoveTop={moveToTop} onDelete={deleteLocal} /> })}</div></SortableContext></div>
          </DndContext>
        </div>}
        {activeTab==="history" && <div className="flex-1 overflow-auto p-2">{groupedLogs.map(([date, items])=><div key={date} className="border dark:border-gray-700 rounded-lg p-2 bg-gray-50 dark:bg-gray-800/50 mb-2"><div className="font-bold text-[11px] mb-1 text-gray-900 dark:text-white">{date} ({items.length})</div><div className="flex flex-col gap-1">{items.map(it=><div key={it.id+"_"+it.completedAt} className="text-[12px] bg-white dark:bg-gray-900 rounded p-1.5 border dark:border-gray-700 flex justify-between text-gray-900 dark:text-gray-100"><span className="truncate">{it.content}</span>{it.fromTodoist && <span className="text-[8px] bg-blue-100 text-blue-700 px-1 rounded ml-1">T</span>}</div>)}</div></div>)}</div>}
        {activeTab==="changelog" && <div className="p-2 text-[11px] text-gray-700 dark:text-gray-300">v1.17.4 토큰 가림+저장&불러오기 복구, 하위업무 100% 표시, 1주일치, 색 Top3 파란/풀Top3 노란, 디자인 v1.16.3 원본 유지</div>}
      </div>
    </div>
  )
}