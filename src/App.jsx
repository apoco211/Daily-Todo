import { useState, useEffect, useMemo } from "react"
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, useDroppable } from "@dnd-kit/core"
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"

const PROXY = "https://todoist-proxy.apoco211.workers.dev"
const VERSION = "v1.17"

function getRootId(task, taskMap) {
  if (!task) return null
  let cur = task
  let visited = new Set()
  while (cur?.parent_id && taskMap[cur.parent_id] &&!visited.has(cur.parent_id)) {
    visited.add(cur.id)
    cur = taskMap[cur.parent_id]
  }
  return cur?.id || task.id
}

function SortableItem({ task, parentContent, isTop, isCandidate, hasChildren, expanded, onToggle, onMoveTop, onMoveDown, onComplete, onDelete, childrenList }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging? 0.5 : 1 }
  const base = "rounded-xl p-3 flex flex-col gap-2 transition-all"
  let colorClass = "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
  if (isTop) colorClass = "bg-blue-50 dark:bg-blue-900/30 border-2 border-blue-300 dark:border-blue-600 shadow-md ring-1 ring-blue-200 dark:ring-blue-800"
  else if (isCandidate) colorClass = "bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-300 dark:border-yellow-700 shadow-sm"

  return (
    <div ref={setNodeRef} style={style} className={`${base} ${colorClass} relative`}>
      {isCandidate && <span className="absolute -top-2 -right-2 text-[10px] bg-yellow-400 text-yellow-900 px-2 py-0.5 rounded-full font-bold shadow">다음 후보</span>}
      <div className="flex items-start gap-2">
        <button {...attributes} {...listeners} className="mt-1 text-gray-400 cursor-grab select-none">≡</button>
        <div className="flex-1 min-w-0">
          {parentContent && <div className="text-[11px] text-gray-500 dark:text-gray-400 mb-0.5 truncate">{parentContent} ▸</div>}
          <div className="text-[14px] leading-snug text-gray-900 dark:text-gray-100 break-words">{task.content}</div>
          <div className="flex gap-1 mt-1 flex-wrap">
            {task.priority >1 && <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${task.priority===4? 'bg-red-500 text-white' : task.priority===3? 'bg-orange-400 text-white' : 'bg-blue-400 text-white'}`}>P{task.priority}</span>}
            {hasChildren && <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-200 dark:bg-gray-700">{childrenList?.length || 0} 하위</span>}
          </div>
        </div>
        <div className="flex flex-col gap-1 ml-1 shrink-0">
          {!isTop? (
            <>
              <button onClick={()=>onMoveTop(task.id)} className="w-7 h-7 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-xs font-bold">▲</button>
              {hasChildren && <button onClick={()=>onToggle(task.id)} className="w-7 h-7 bg-gray-100 dark:bg-gray-700 rounded-lg text-[11px]">{expanded? '▲' : '▼'}</button>}
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

      {/* 풀에서 펼친 하위 - 버그 수정 핵심 */}
      {!isTop && expanded && childrenList && childrenList.length>0 && (
        <div className="ml-6 mt-2 pl-3 border-l-2 border-gray-200 dark:border-gray-700 flex flex-col gap-2">
          {childrenList.map(child=>{
            const childParent = parentContent || task.content
            return (
            <div key={child.id} className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-2 flex justify-between items-center border dark:border-gray-700">
              <div className="min-w-0 flex-1">
                <div className="text-[11px] text-gray-500 truncate">{childParent} ▸</div>
                <div className="text-[13px] truncate">{child.content}</div>
              </div>
              <div className="flex gap-1 ml-2">
                <button onClick={()=>onMoveTop(child.id)} className="w-6 h-6 bg-blue-500 text-white rounded text-[10px]">▲</button>
                <button onClick={()=>onDelete(child.id)} className="w-6 h-6 bg-gray-200 dark:bg-gray-700 rounded text-[10px]">✕</button>
              </div>
            </div>
          )})}
        </div>
      )}

      {/* Top3 내부 하위 표시 */}
      {isTop && childrenList && childrenList.length>0 && (
        <div className="ml-4 mt-2 pl-3 border-l-2 border-blue-200 dark:border-blue-700 flex flex-col gap-1.5">
          <div className="text-[10px] text-blue-600 dark:text-blue-300 font-bold">{childrenList.length}개 하위 포함 (1그룹)</div>
          {childrenList.map(ch=>(
            <div key={ch.id} className="text-[12px] bg-white/80 dark:bg-gray-800/70 rounded px-2 py-1.5 flex justify-between items-center">
              <span className="truncate">• {ch.content}</span>
              <button onClick={()=>onComplete(ch.id)} className="ml-2 shrink-0 text-[10px] bg-black dark:bg-white text-white dark:text-black rounded px-1.5 py-0.5">✓</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function TopDrop({ children, isOver }) {
  const { setNodeRef } = useDroppable({ id: "top-container" })
  return <div ref={setNodeRef} className={`rounded-2xl border-2 border-dashed p-3 min-h-[160px] transition-all ${isOver? 'border-blue-400 bg-blue-50/70 dark:bg-blue-900/20' : 'border-gray-300 dark:border-gray-600 bg-gradient-to-b from-blue-50/50 to-white dark:from-blue-950/20 dark:to-gray-900'}`}>{children}</div>
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
  const [isTopOver, setIsTopOver] = useState(false)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))
  const taskMap = useMemo(()=>{ const m={}; tasks.forEach(t=>m[t.id]=t); return m }, [tasks])

  useEffect(()=>{ localStorage.setItem("top3Ids", JSON.stringify(top3Ids)) }, [top3Ids])
  useEffect(()=>{ localStorage.setItem("completed_logs", JSON.stringify(logs)) }, [logs])
  useEffect(()=>{ localStorage.setItem("dark", dark) }, [dark])
  useEffect(()=>{ if(dark) document.documentElement.classList.add("dark"); else document.documentElement.classList.remove("dark") }, [dark])

  const getChildren = (parentId) => tasks.filter(t=>t.parent_id===parentId)

  const fetchTasks = async () => {
    if(!token) return
    try{
      const res = await fetch(`${PROXY}/api/v1/tasks/filter?query=today%20|%20overdue`, { headers: { Authorization: `Bearer ${token}` } })
      const data = await res.json()
      const list = data.results || data.tasks || data || []
      setTasks(list)
      const ids = new Set(list.map(t=>t.id))
      setTop3Ids(prev=>{
        const filtered = prev.filter(id=>ids.has(id))
        const seen = new Set()
        const dedup=[]
        for(const id of filtered){
          const map = Object.fromEntries(list.map(t=>[t.id,t]))
          const root = getRootId(map[id], map)
          if(!seen.has(root)){ seen.add(root); dedup.push(id) }
        }
        return dedup
      })
    }catch(e){ console.error("fetchTasks", e) }
  }

  // v1.17 NEW: 1주일치 완료 가져오기
  const fetchCompleted = async () => {
    if(!token) return
    setLoadingCompleted(true)
    try{
      const since = new Date(Date.now()-7*24*60*60*1000).toISOString()
      const res = await fetch(`${PROXY}/api/v1/completed/get_all?since=${encodeURIComponent(since)}&limit=100`, { headers: { Authorization: `Bearer ${token}` } })
      if(!res.ok) throw new Error("completed api fail")
      const data = await res.json()
      setCompletedFromTodoist(data.items || [])
    }catch(e){ console.log("completed fetch fail, use local only", e); setCompletedFromTodoist([]) }
    setLoadingCompleted(false)
  }

  useEffect(()=>{ fetchTasks() }, [token])
  useEffect(()=>{ if(activeTab==="history") fetchCompleted() }, [activeTab])

  const getTop3GroupCount = () => {
    const set = new Set()
    top3Ids.forEach(id=>{ const t=taskMap[id]; if(t) set.add(getRootId(t, taskMap)) })
    return set.size
  }

  const moveToTop = (id) => {
    const task = taskMap[id]; if(!task) return
    const root = getRootId(task, taskMap)
    const existingRoots = new Set(top3Ids.map(tid=> taskMap[tid]? getRootId(taskMap[tid], taskMap) : null).filter(Boolean))
    if(existingRoots.has(root)) return
    if(getTop3GroupCount()>=3){ alert("Top3는 최대 3개! (부모+하위 포함 1그룹)"); return }
    setTop3Ids(prev=>[...prev, id])
  }
  const moveDown = (id) => setTop3Ids(prev=>prev.filter(t=>t!==id))

  const deleteLocal = (id) => {
    const toRemove = new Set([id])
    tasks.forEach(t=>{ if(t.parent_id===id) toRemove.add(t.id) })
    setTasks(prev=>prev.filter(t=>!toRemove.has(t.id)))
    setTop3Ids(prev=>prev.filter(t=>!toRemove.has(t)))
  }

  const completeTask = async (id) => {
    const task = taskMap[id]; if(!task) return
    const toComplete = [task,...getChildren(id)]
    try{ for(const t of toComplete){ await fetch(`${PROXY}/api/v1/tasks/${t.id}/close`, { method:"POST", headers:{ Authorization:`Bearer ${token}` } }) } }catch(e){ console.log(e) }
    const now = new Date(); const dateKey = now.toISOString().slice(0,10)
    const newLogs = toComplete.map(t=>({ id: t.id, content: t.content, completedAt: now.toISOString(), dateKey }))
    setLogs(prev=>[...newLogs,...prev])
    const removeSet = new Set(toComplete.map(t=>t.id))
    setTasks(prev=>prev.filter(t=>!removeSet.has(t.id)))
    setTop3Ids(prev=>prev.filter(t=>!removeSet.has(t)))
  }

  const addTask = async () => {
    if(!newContent.trim()) return
    const body = { content: newContent, priority: newPri, parent_id: newParent||undefined }
    try{
      const res = await fetch(`${PROXY}/api/v1/tasks`, { method:"POST", headers:{ "Content-Type":"application/json", Authorization:`Bearer ${token}` }, body: JSON.stringify(body) })
      const created = await res.json()
      setTasks(prev=>[created,...prev]); setNewContent(""); setNewParent("")
    }catch(e){ alert("추가 실패 - 토큰 확인") }
  }

  const topRoots = useMemo(()=>{ const s=new Set(); top3Ids.forEach(id=>{ const t=taskMap[id]; if(t) s.add(getRootId(t, taskMap)) }); return s }, [top3Ids, taskMap])
  const poolTasks = useMemo(()=> tasks.filter(t=>{
    const root=getRootId(t, taskMap)
    if(topRoots.has(root)) return false
    if(t.parent_id && taskMap[t.parent_id]) return false // 자식은 부모 카드 안에서만 표시 (버그 수정)
    return true
  }), [tasks, topRoots, taskMap])

  const handleDragEnd = (event) => {
    const { active, over } = event; setIsTopOver(false); if(!over) return
    if(over.id==="top-container"){ moveToTop(active.id); return }
    if(poolTasks.find(t=>t.id===active.id) && poolTasks.find(t=>t.id===over.id)){
      const oldIdx = poolTasks.findIndex(t=>t.id===active.id)
      const newIdx = poolTasks.findIndex(t=>t.id===over.id)
      const newPool = arrayMove(poolTasks, oldIdx, newIdx)
      const other = tasks.filter(t=>!poolTasks.find(p=>p.id===t.id))
      let rebuilt=[]; newPool.forEach(p=>{ rebuilt.push(p); getChildren(p.id).forEach(c=>rebuilt.push(c)) })
      setTasks([...rebuilt,...other.filter(o=>!rebuilt.find(r=>r.id===o.id))])
      return
    }
    if(top3Ids.includes(active.id) && top3Ids.includes(over.id)){
      setTop3Ids(prev=> arrayMove(prev, top3Ids.indexOf(active.id), top3Ids.indexOf(over.id)))
    }
  }

  const groupedLogs = useMemo(()=>{
    const all=[...logs]
    completedFromTodoist.forEach(c=>{ const dk=(c.completed_at||"").slice(0,10); if(dk) all.push({ id:c.task_id||c.id, content:c.content, completedAt:c.completed_at, dateKey:dk, fromTodoist:true }) })
    const map=new Map(); all.forEach(l=>{ const key=l.id+"_"+l.dateKey; if(!map.has(key)) map.set(key,l) })
    const arr=Array.from(map.values()).sort((a,b)=> new Date(b.completedAt)-new Date(a.completedAt))
    const grouped={}; arr.forEach(l=>{ if(!grouped[l.dateKey]) grouped[l.dateKey]=[]; grouped[l.dateKey].push(l) })
    return Object.entries(grouped).sort((a,b)=> b[0].localeCompare(a[0]))
  }, [logs, completedFromTodoist])

  return (
    <div className={`min-h-screen bg-gray-50 dark:bg-gray-950 flex justify-center ${dark?'dark':''}`}>
      <div className="w-full max-w-[430px] bg-white dark:bg-gray-900 min-h-screen shadow-xl flex flex-col" style={{paddingTop:"env(safe-area-inset-top)"}}>
        <header className="flex justify-between items-center p-4 border-b dark:border-gray-800">
          <div className="font-bold text-[16px]">{VERSION} <span className="text-xs font-normal text-gray-500">Daily-Todo</span></div>
          <div className="flex gap-2">
            <button onClick={()=>setShowToken(!showToken)} className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 text-sm">⚙️</button>
            <button onClick={()=>setDark(!dark)} className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 text-sm">{dark?'☀️':'🌙'}</button>
          </div>
        </header>
        {showToken && <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border-b dark:border-gray-800 flex gap-2"><input value={tmpToken} onChange={e=>setTmpToken(e.target.value)} placeholder="Todoist token" className="flex-1 px-2 py-1.5 rounded border text-xs dark:bg-gray-800" /><button onClick={()=>{localStorage.setItem("todoist_token", tmpToken); setToken(tmpToken); setShowToken(false); fetchTasks()}} className="bg-black dark:bg-white text-white dark:text-black px-3 rounded text-xs font-bold">저장</button></div>}
        <div className="flex border-b dark:border-gray-800 sticky top-0 bg-white dark:bg-gray-900 z-10">{["today","history","changelog"].map(tab=><button key={tab} onClick={()=>setActiveTab(tab)} className={`flex-1 py-3 text-[13px] ${activeTab===tab? 'border-b-2 border-black dark:border-white font-bold' : 'text-gray-500'}`}>{tab==="today"?"오늘 할 일":tab==="history"?"날짜별 완료":"빌드 히스토리"}</button>)}</div>

        {activeTab==="today" && <div className="flex-1 overflow-auto p-3 flex flex-col gap-4">
          <div className="flex gap-2">
            <input value={newContent} onChange={e=>setNewContent(e.target.value)} onKeyDown={e=>e.key==='Enter' && addTask()} placeholder="추가업무" className="flex-1 px-3 py-2.5 rounded-xl border bg-blue-50 dark:bg-gray-800 border-blue-200 dark:border-gray-700 text-sm outline-none focus:ring-2 focus:ring-blue-300" />
            <select value={newPri} onChange={e=>setNewPri(Number(e.target.value))} className="px-2 rounded-xl border text-sm dark:bg-gray-800"><option value={1}>P4</option><option value={2}>P3</option><option value={3}>P2</option><option value={4}>P1</option></select>
            <select value={newParent} onChange={e=>setNewParent(e.target.value)} className="px-2 rounded-xl border text-sm dark:bg-gray-800 max-w-[85px]"><option value="">부모없음</option>{tasks.filter(t=>!t.parent_id).map(t=><option key={t.id} value={t.id}>{t.content.slice(0,12)}</option>)}</select>
            <button onClick={addTask} className="bg-blue-500 hover:bg-blue-600 text-white px-4 rounded-xl text-sm font-bold">+</button>
          </div>

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd} onDragOver={(e)=>{ if(e.over?.id==="top-container") setIsTopOver(true); else setIsTopOver(false) }}>
            <div className="flex flex-col gap-2">
              <div className="text-[13px] font-bold flex justify-between items-center"><span>🎯 Top3 ({getTop3GroupCount()}/3)</span><span className="text-[10px] font-normal text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full">파란색 강조</span></div>
              <TopDrop isOver={isTopOver}>
                {top3Ids.length===0? <div className="text-center text-gray-400 text-sm py-10">▲로 올려서 Top3를 채워보세요<br/><span className="text-[11px]">위로 올라온 카드는 파란색으로 강조됩니다</span></div> : <SortableContext items={top3Ids} strategy={verticalListSortingStrategy}><div className="flex flex-col gap-2.5">{top3Ids.map(id=>{ const t=taskMap[id]; if(!t) return null; const children=getChildren(id); return <SortableItem key={id} task={t} isTop={true} hasChildren={children.length>0} childrenList={children} onComplete={completeTask} onMoveDown={moveDown} onDelete={deleteLocal} /> })}</div></SortableContext>}
              </TopDrop>
            </div>

            <div className="flex flex-col gap-2 mt-1">
              <div className="text-[13px] font-bold flex justify-between items-center"><span>📋 오늘 풀 ({poolTasks.length})</span><span className="text-[10px] font-normal text-yellow-700 bg-yellow-100 px-2 py-0.5 rounded-full">상위3개 노란색 후보</span></div>
              <SortableContext items={poolTasks.map(t=>t.id)} strategy={verticalListSortingStrategy}>
                <div className="flex flex-col gap-2.5">
                  {poolTasks.map((t, idx)=>{
                    const children=getChildren(t.id); const isCandidate=idx<3; const expanded=expandedIds.has(t.id)
                    return <SortableItem key={t.id} task={t} isCandidate={isCandidate} hasChildren={children.length>0} expanded={expanded} childrenList={children} onToggle={(pid)=>setExpandedIds(prev=>{ const n=new Set(prev); if(n.has(pid)) n.delete(pid); else n.add(pid); return n })} onMoveTop={moveToTop} onDelete={deleteLocal} />
                  })}
                </div>
              </SortableContext>
              {poolTasks.length===0 && <div className="text-center text-gray-400 text-sm py-6">오늘 할 일이 없습니다 🎉</div>}
            </div>
          </DndContext>
        </div>}

        {activeTab==="history" && <div className="flex-1 overflow-auto p-3">
          <div className="flex justify-between items-center mb-3"><div className="font-bold text-sm">완료 기록 (Todoist 1주일 + 로컬)</div><button onClick={fetchCompleted} className="text-[11px] bg-gray-100 dark:bg-gray-800 px-2.5 py-1.5 rounded-lg border">{loadingCompleted?"불러오는중...":"🔄 1주일치 새로고침"}</button></div>
          {groupedLogs.length===0? <div className="text-center text-gray-400 py-12 text-sm">완료 기록이 없습니다.<br/>Top3에서 ✓로 완료하면 여기에 쌓입니다.<br/>Todoist에서 완료한 것도 1주일치는 자동으로 가져옵니다.</div> : <div className="flex flex-col gap-4">{groupedLogs.map(([date, items])=><div key={date} className="border dark:border-gray-700 rounded-xl p-3 bg-gray-50 dark:bg-gray-800/50"><div className="font-bold text-xs mb-2 flex justify-between"><span>{date}</span><span className="font-normal text-gray-500">{items.length}개</span></div><div className="flex flex-col gap-1.5">{items.map(it=><div key={it.id+"_"+it.completedAt} className="text-[13px] bg-white dark:bg-gray-900 rounded-lg p-2.5 border dark:border-gray-700 flex justify-between items-center"><span className="truncate flex-1 mr-2">{it.content}</span><div className="flex gap-1 shrink-0">{it.fromTodoist && <span className="text-[9px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-bold">Todoist</span>}<span className="text-[10px] text-gray-400">{new Date(it.completedAt).toLocaleTimeString('ko-KR',{hour:'2-digit', minute:'2-digit'})}</span></div></div>)}</div></div>)}</div>}
        </div>}

        {activeTab==="changelog" && <div className="p-4 text-[12px] leading-relaxed dark:text-gray-300"><div className="font-bold text-sm mb-3">📦 빌드 히스토리</div><div className="border rounded-xl p-3 mb-3 bg-blue-50 dark:bg-blue-900/20 border-blue-200"><div className="font-bold">v1.17 (2026-09-28) - 3가지 통합 업데이트</div><ul className="list-disc pl-4 mt-2 space-y-1"><li><b>Todoist 완료 1주일치 연동:</b> /completed/get_all?since=7일전&limit=100 프록시 경유, 날짜별 완료 탭에서 로컬+Todoist 합쳐서 표시, 중복 제거</li><li><b>2단계 색 시스템:</b> Top3 박스 파란색 강조 (bg-blue-50 border-blue-300), 풀 상위 3개 노란색 후보 (bg-yellow-50 + 다음 후보 뱃지), 아래로 내리면 색 제거</li><li><b>하위업무 표시 버그 수정:</b> parent_id 포함 전체 fetch 유지, pool에서는 부모만 표시, 자식은 ▼ 펼치기로 border-l-2 표시, breadcrumb 유지, Top3에서는 border-l-2로 자식 항상 표시</li></ul></div><div className="border rounded-xl p-3 opacity-70"><div className="font-bold">v1.16.3</div><div>풀 드래그 고정, Top3/풀 분리, 부모+하위 1그룹 유지</div></div></div>}
      </div>
    </div>
  )
}