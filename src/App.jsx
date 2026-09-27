import { useState, useEffect, useMemo } from "react"
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, useDroppable } from "@dnd-kit/core"
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"

const PROXY = "https://todoist-proxy.apoco211.workers.dev"
const VERSION = "v1.17.1"

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

// v1.16.3 디자인 그대로 유지, 색만 요청한 것만 최소 추가
function SortableItem({ task, parentContent, isTop, isCandidate, hasChildren, expanded, onToggle, onMoveTop, onMoveDown, onComplete, onDelete, childrenList }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging? 0.5 : 1 }

  // v1.16.3 원본: bg-white border-gray-200
  // 요청한 색만 최소 추가: Top3 파란색, 풀 상위3 노란색
  let cardClass = "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
  if (isTop) cardClass = "bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800" // Top3만 파란색 (요청)
  else if (isCandidate) cardClass = "bg-yellow-50/70 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-800/50" // 풀 상위3만 노란색 (요청)

  return (
    <div ref={setNodeRef} style={style} className={`rounded-xl p-3 flex flex-col gap-2 ${cardClass}`}>
      <div className="flex items-start gap-2">
        <button {...attributes} {...listeners} className="mt-1 text-gray-400 cursor-grab">≡</button>
        <div className="flex-1">
          {parentContent && <div className="text-[11px] text-gray-500 dark:text-gray-400 mb-0.5">{parentContent} ▸</div>}
          <div className="text-[14px] leading-snug text-gray-900 dark:text-gray-100 break-words">{task.content}</div>
          <div className="flex gap-1 mt-1">
            {task.priority > 1 && <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${task.priority===4?'bg-red-500 text-white':task.priority===3?'bg-orange-400 text-white':'bg-blue-400 text-white'}`}>P{task.priority}</span>}
            {hasChildren && <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-200 dark:bg-gray-700">{childrenList?.length} 하위</span>}
          </div>
        </div>
        <div className="flex flex-col gap-1 ml-1">
          {!isTop? (
            <>
              <button onClick={()=>onMoveTop(task.id)} className="w-7 h-7 bg-blue-500 text-white rounded-lg text-xs font-bold hover:bg-blue-600">▲</button>
              {hasChildren && <button onClick={()=>onToggle(task.id)} className="w-7 h-7 bg-gray-100 dark:bg-gray-700 rounded-lg text-[11px]">{expanded?'▲':'▼'}</button>}
              <button onClick={()=>onDelete(task.id)} className="w-7 h-7 bg-gray-100 dark:bg-gray-700 rounded-lg text-xs">✕</button>
            </>
          ) : (
            <>
              <button onClick={()=>onComplete(task.id)} className="w-7 h-7 bg-black dark:bg-white text-white dark:text-black rounded-lg text-xs font-bold">✓</button>
              <button onClick={()=>onMoveDown(task.id)} className="w-7 h-7 bg-gray-100 dark:bg-gray-700 rounded-lg text-xs">▼</button>
            </>
          )}
        </div>
      </div>

      {/* 하위업무 펼치기 - 풀 */}
      {!isTop && expanded && childrenList?.length>0 && (
        <div className="ml-6 mt-2 pl-3 border-l-2 border-gray-200 dark:border-gray-700 flex flex-col gap-2">
          {childrenList.map(child=>(
            <div key={child.id} className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-2 flex justify-between items-center border dark:border-gray-700">
              <div>
                <div className="text-[11px] text-gray-500">{task.content} ▸</div>
                <div className="text-[13px]">{child.content}</div>
              </div>
              <div className="flex gap-1">
                <button onClick={()=>onMoveTop(child.id)} className="w-6 h-6 bg-blue-500 text-white rounded text-[10px]">▲</button>
                <button onClick={()=>onDelete(child.id)} className="w-6 h-6 bg-gray-200 dark:bg-gray-700 rounded text-[10px]">✕</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Top3 내부 하위 */}
      {isTop && childrenList?.length>0 && (
        <div className="ml-4 mt-1 pl-3 border-l-2 border-gray-200 dark:border-gray-600 flex flex-col gap-1.5">
          <div className="text-[10px] text-gray-500">{childrenList.length}개 하위 포함 (1그룹)</div>
          {childrenList.map(ch=>(
            <div key={ch.id} className="text-[12px] bg-white/70 dark:bg-gray-800/70 rounded px-2 py-1 flex justify-between">
              <span>• {ch.content}</span>
              <button onClick={()=>onComplete(ch.id)} className="text-[10px] bg-black text-white dark:bg-white dark:text-black rounded px-1.5">✓</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function TopDrop({ children }) {
  const { setNodeRef, isOver } = useDroppable({ id: "top-container" })
  // v1.16.3 원본: dashed border, min-h 160px - 그대로
  return <div ref={setNodeRef} className={`rounded-2xl border-2 border-dashed p-3 min-h-[160px] ${isOver? 'border-blue-400 bg-blue-50/30' : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900'}`}>{children}</div>
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
  const [loadingCompleted, setLoadingCompleted] = useState(false)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))
  const taskMap = useMemo(()=>{ const m={}; tasks.forEach(t=>m[t.id]=t); return m }, [tasks])
  useEffect(()=>{ localStorage.setItem("top3Ids", JSON.stringify(top3Ids)) }, [top3Ids])
  useEffect(()=>{ localStorage.setItem("completed_logs", JSON.stringify(logs)) }, [logs])
  useEffect(()=>{ if(dark) document.documentElement.classList.add("dark"); else document.documentElement.classList.remove("dark"); localStorage.setItem("dark", dark) }, [dark])

  const getChildren = (parentId) => tasks.filter(t=>t.parent_id===parentId)

  // v1.17.1 핵심: 하위업무 100% 표시를 위해 부모별 자식 추가 fetch
  const fetchTasks = async () => {
    if(!token) return
    try{
      // 1. 오늘 + overdue
      const res = await fetch(`${PROXY}/api/v1/tasks/filter?query=today%20|%20overdue`, { headers: { Authorization: `Bearer ${token}` } })
      const data = await res.json()
      const todays = data.results || data.tasks || data || []

      // 2. 하위업무 버그 수정: 각 task의 자식을 별도로 가져오기
      const childResults = await Promise.all(
        todays.map(async (t)=>{
          try{
            const r = await fetch(`${PROXY}/api/v1/tasks?parent_id=${t.id}`, { headers: { Authorization: `Bearer ${token}` } })
            const d = await r.json()
            return d.results || d.tasks || (Array.isArray(d)? d : [])
          }catch{ return [] }
        })
      )
      const allChildren = childResults.flat()

      // 중복 제거 합치기
      const mergedMap = {}
      ;[...todays,...allChildren].forEach(t=>{ mergedMap[t.id]=t })
      const merged = Object.values(mergedMap)

      setTasks(merged)

      // Top3 정리
      const ids = new Set(merged.map(t=>t.id))
      setTop3Ids(prev=>{
        const filtered = prev.filter(id=>ids.has(id))
        const seen = new Set()
        const dedup=[]
        const m = Object.fromEntries(merged.map(t=>[t.id,t]))
        for(const id of filtered){
          const root = getRootId(m[id], m)
          if(!seen.has(root)){ seen.add(root); dedup.push(id) }
        }
        return dedup
      })
    }catch(e){ console.error(e) }
  }

  const fetchCompleted = async () => {
    if(!token) return
    setLoadingCompleted(true)
    try{
      const since = new Date(Date.now()-7*24*60*60*1000).toISOString()
      const res = await fetch(`${PROXY}/api/v1/completed/get_all?since=${encodeURIComponent(since)}&limit=100`, { headers: { Authorization: `Bearer ${token}` } })
      const data = await res.json()
      setCompletedFromTodoist(data.items || [])
    }catch{ setCompletedFromTodoist([]) }
    setLoadingCompleted(false)
  }

  useEffect(()=>{ fetchTasks() }, [token])
  useEffect(()=>{ if(activeTab==="history") fetchCompleted() }, [activeTab])

  const getTop3GroupCount = () => {
    const s=new Set()
    top3Ids.forEach(id=>{ const t=taskMap[id]; if(t) s.add(getRootId(t, taskMap)) })
    return s.size
  }
  const moveToTop = (id) => {
    const t=taskMap[id]; if(!t) return
    const root=getRootId(t, taskMap)
    const existing=new Set(top3Ids.map(tid=>taskMap[tid]?getRootId(taskMap[tid], taskMap):null).filter(Boolean))
    if(existing.has(root)) return
    if(getTop3GroupCount()>=3){ alert("Top3는 최대 3개! (부모+하위 포함 1그룹)"); return }
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
    if(t.parent_id && taskMap[t.parent_id]) return false // 자식은 부모 안에서만
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
        <header className="flex justify-between items-center p-4 border-b dark:border-gray-800">
          <div className="font-bold">{VERSION} Daily-Todo</div>
          <div className="flex gap-2">
            <button onClick={()=>setShowToken(!showToken)} className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800">⚙️</button>
            <button onClick={()=>setDark(!dark)} className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800">{dark?'☀️':'🌙'}</button>
          </div>
        </header>
        {showToken && <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border-b flex gap-2"><input value={tmpToken} onChange={e=>setTmpToken(e.target.value)} placeholder="Todoist token" className="flex-1 px-2 py-1 rounded border text-xs" /><button onClick={()=>{localStorage.setItem("todoist_token", tmpToken); setToken(tmpToken); setShowToken(false)}} className="bg-black text-white px-3 rounded text-xs">저장</button></div>}
        <div className="flex border-b dark:border-gray-800">
          {["today","history","changelog"].map(tab=><button key={tab} onClick={()=>setActiveTab(tab)} className={`flex-1 py-2.5 text-[13px] ${activeTab===tab?'border-b-2 border-black dark:border-white font-bold':'text-gray-500'}`}>{tab==="today"?"오늘 할 일":tab==="history"?"날짜별 완료":"빌드 히스토리"}</button>)}
        </div>
        {activeTab==="today" && <div className="flex-1 overflow-auto p-3 flex flex-col gap-4">
          <div className="flex gap-2">
            <input value={newContent} onChange={e=>setNewContent(e.target.value)} placeholder="추가업무" className="flex-1 px-3 py-2 rounded-xl border bg-blue-50 dark:bg-gray-800 text-sm" />
            <select value={newPri} onChange={e=>setNewPri(Number(e.target.value))} className="px-2 rounded-xl border text-sm"><option value={1}>P4</option><option value={2}>P3</option><option value={3}>P2</option><option value={4}>P1</option></select>
            <select value={newParent} onChange={e=>setNewParent(e.target.value)} className="px-2 rounded-xl border text-sm max-w-[80px]"><option value="">부모없음</option>{tasks.filter(t=>!t.parent_id).map(t=><option key={t.id} value={t.id}>{t.content.slice(0,10)}</option>)}</select>
            <button onClick={addTask} className="bg-blue-500 text-white px-3 rounded-xl text-sm">+</button>
          </div>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <div className="flex flex-col gap-2"><div className="text-[13px] font-bold">🎯 Top3 ({getTop3GroupCount()}/3)</div><TopDrop>{top3Ids.length===0? <div className="text-center text-gray-400 text-sm py-8">▲로 올려서 Top3를 채워보세요</div> : <SortableContext items={top3Ids} strategy={verticalListSortingStrategy}><div className="flex flex-col gap-2">{top3Ids.map(id=>{ const t=taskMap[id]; if(!t) return null; const children=getChildren(id); return <SortableItem key={id} task={t} isTop={true} hasChildren={children.length>0} childrenList={children} onComplete={completeTask} onMoveDown={moveDown} onDelete={deleteLocal} /> })}</div></SortableContext>}</TopDrop></div>
            <div className="flex flex-col gap-2 mt-2"><div className="text-[13px] font-bold">📋 오늘 풀 ({poolTasks.length})</div><SortableContext items={poolTasks.map(t=>t.id)} strategy={verticalListSortingStrategy}><div className="flex flex-col gap-2">{poolTasks.map((t, idx)=>{ const children=getChildren(t.id); const isCandidate=idx<3; const expanded=expandedIds.has(t.id); return <SortableItem key={t.id} task={t} isCandidate={isCandidate} hasChildren={children.length>0} expanded={expanded} childrenList={children} onToggle={(pid)=>setExpandedIds(prev=>{ const n=new Set(prev); if(n.has(pid)) n.delete(pid); else n.add(pid); return n })} onMoveTop={moveToTop} onDelete={deleteLocal} /> })}</div></SortableContext></div>
          </DndContext>
        </div>}
        {activeTab==="history" && <div className="flex-1 overflow-auto p-3"><div className="flex justify-between mb-3"><div className="font-bold text-sm">완료 기록 (7일 + 로컬)</div><button onClick={fetchCompleted} className="text-xs bg-gray-100 px-2 py-1 rounded">{loadingCompleted?"...":"🔄 새로고침"}</button></div>{groupedLogs.map(([date, items])=><div key={date} className="border rounded-xl p-3 bg-gray-50 dark:bg-gray-800/50 mb-3"><div className="font-bold text-xs mb-2">{date} ({items.length})</div><div className="flex flex-col gap-1.5">{items.map(it=><div key={it.id+"_"+it.completedAt} className="text-[13px] bg-white dark:bg-gray-900 rounded-lg p-2 border flex justify-between"><span>{it.content}</span>{it.fromTodoist && <span className="text-[9px] bg-blue-100 px-1 rounded">Todoist</span>}</div>)}</div></div>)}</div>}
        {activeTab==="changelog" && <div className="p-3 text-xs"><div className="font-bold mb-2">v1.17.1</div><ul className="list-disc pl-4 space-y-1"><li>디자인 v1.16.3 원복, 색만 Top3 파란/풀Top3 노란 최소 적용</li><li>하위업무 버그 진짜 수정: parent_id 별도 fetch로 100% 표시</li><li>1주일치 완료 Todoist 연동 유지</li></ul></div>}
      </div>
    </div>
  )
}