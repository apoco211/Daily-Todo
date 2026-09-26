import { useState, useEffect } from "react"
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragOverlay } from "@dnd-kit/core"
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"

const priorityColor = { 4: "bg-red-500", 3: "bg-orange-400", 2: "bg-blue-500", 1: "bg-gray-300" }
const priorityLabel = { 4: "P1", 3: "P2", 2: "P3", 1: "P4" }

function SortableItem({ task, isActive, onComplete, depth = 0, childCount = 0 }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging? 0.5 : 1, marginLeft: depth? `${depth * 20}px` : "0px" }
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}
      className={`flex items-center gap-3 p-3 rounded-xl border shadow-sm ${depth? "bg-zinc-50 dark:bg-zinc-800/50 border-l-2 border-zinc-200 dark:border-zinc-800" : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800"} ${isActive? "ring-2 ring-zinc-900 dark:ring-white" : ""}`}>
      {depth>0 && <span className="text-zinc-400 text-">└</span>}
      <div className={`w-2 h-2 rounded-full ${priorityColor[task.priority]}`} />
      <span className={`flex-1 text- ${depth? "text- text-zinc-600 dark:text-zinc-300" : "text-zinc-800 dark:text-zinc-100"}`}>{task.content}</span>
      {childCount>0 && <span className="text- px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300">{childCount} 하위</span>}
      <span className="text- px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500">{priorityLabel[task.priority]}</span>
      {isActive && <button onClick={() => onComplete(task)} className="ml-1 w-7 h-7 rounded-full bg-zinc-900 dark:bg-white text-white dark:text-black">✓</button>}
    </div>
  )
}

function buildTaskTree(tasks) {
  const map = new Map()
  tasks.forEach(t => map.set(String(t.id), {...t, children: [], depth: 0 }))
  const roots=[]
  tasks.forEach(t=>{
    const node=map.get(String(t.id))
    const pid=t.parent_id? String(t.parent_id):null
    if(pid && map.has(pid)){ const p=map.get(pid); node.depth=p.depth+1; p.children.push(node) } else roots.push(node)
  })
  const flat=[]
  const dfs=n=>{ flat.push(n); n.children.sort((a,b)=>(a.order||0)-(b.order||0)); n.children.forEach(dfs) }
  roots.sort((a,b)=>(a.order||0)-(b.order||0)); roots.forEach(dfs)
  return { flat }
}

export default function App() {
  const [theme,setTheme]=useState(localStorage.getItem("theme")||(window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"))
  const [pool,setPool]=useState([])
  const [active,setActive]=useState([])
  const [logs,setLogs]=useState(()=>{ try{ return JSON.parse(localStorage.getItem("logs")||"[]") }catch{ return [] } })
  const [custom,setCustom]=useState("")
  const [search,setSearch]=useState("")
  const [todoistToken,setTodoistToken]=useState(localStorage.getItem("todoist_token")||"")
  const [proxyUrl,setProxyUrl]=useState(localStorage.getItem("todoist_proxy")||"https://todoist-proxy.apoco211.workers.dev/")
  const [showToken,setShowToken]=useState(false)
  const [activeId,setActiveId]=useState(null)
  const [status,setStatus]=useState("API키를 입력하면 오늘 + 하위업무를 가져와요")
  const [error,setError]=useState("")
  const [showSubtasks,setShowSubtasks]=useState(true)

  useEffect(()=>{ document.documentElement.classList.toggle("dark",theme==="dark"); localStorage.setItem("theme",theme) },[theme])
  useEffect(()=>{ localStorage.setItem("logs",JSON.stringify(logs)) },[logs])

  async function fetchWithProxy(target, token, method="GET", body=null) {
    const headers={ Authorization:`Bearer ${token}` }
    if(body) headers["Content-Type"]="application/json"
    const doFetch = async (url) => {
      const res = await fetch(url, { method, headers, body: body? JSON.stringify(body): undefined, mode: "cors" })
      const text = await res.text()
      if(!res.ok) throw new Error(`${res.status} ${text.slice(0,200)}`)
      try { return JSON.parse(text) } catch { return {} }
    }
    try {
      return await doFetch(target)
    } catch(e) {
      if(!proxyUrl) throw e
      const pUrl=`${proxyUrl.replace(/\/$/,"")}?target=${encodeURIComponent(target)}`
      return await doFetch(pUrl)
    }
  }

  async function fetchToday() {
    if(!todoistToken){ setStatus("토큰 없음"); return }
    setStatus("불러오는 중..."); setError("")
    try {
      // NEW API v1: POST /api/v1/tasks/filter {query:"today"}
      const data = await fetchWithProxy("https://api.todoist.com/api/v1/tasks/filter", todoistToken, "POST", { query: "today" })
      const todayTasks = data.results || data.items || data || []
      // 하위업무는 parent_id로 필터
      let allTasks = [...todayTasks]
      // v1에서는 parent_id로 필터하려면 한번 더 호출
      try {
        const childData = await fetchWithProxy("https://api.todoist.com/api/v1/tasks/filter", todoistToken, "POST", { query: "today & subtask" })
        const subs = childData.results || []
        subs.forEach(s=>{ if(!allTasks.find(a=>a.id===s.id)) allTasks.push(s) })
      } catch {}

      const { flat } = buildTaskTree(allTasks.map(t=>({ id:String(t.id), content:t.content, priority:t.priority||1, parent_id:t.parent_id?String(t.parent_id):null, order:t.child_order||t.order||0 })))
      setPool(flat)
      if(active.length===0 && flat.length>0){ setActive(flat.filter(f=>f.depth===0).slice(0,3)) }
      setStatus(`오늘 ${todayTasks.length}개 = 총 ${flat.length}개`)
    } catch(e){ setStatus("실패"); setError(String(e)) }
  }

  useEffect(()=>{ if(todoistToken) fetchToday() },[])

  const sensors=useSensors(useSensor(PointerSensor,{activationConstraint:{distance:8}}))
  const filteredPool=pool.filter(t=>!active.find(a=>a.id===t.id)).filter(t=>showSubtasks||t.depth===0).filter(t=>t.content.toLowerCase().includes(search.toLowerCase()))

  function handleDragEnd(event){
    const {active:a,over}=event; if(!over) return
    if(active.find(x=>x.id===a.id)&&active.find(x=>x.id===over.id)){ setActive(items=>{ const oi=items.findIndex(i=>i.id===a.id); const ni=items.findIndex(i=>i.id===over.id); return arrayMove(items,oi,ni)}); return }
    if(pool.find(x=>x.id===a.id)&&pool.find(x=>x.id===over.id)){ setPool(items=>{ const oi=items.findIndex(i=>i.id===a.id); const ni=items.findIndex(i=>i.id===over.id); return arrayMove(items,oi,ni)}); return }
    if(pool.find(x=>x.id===a.id)&&active.find(x=>x.id===over.id)&&active.length<3){ const task=pool.find(p=>p.id===a.id); if(task) setActive(prev=>[...prev,task]); return }
    if(active.find(x=>x.id===a.id)&&over.id==="pool-droppable"){ setActive(prev=>prev.filter(p=>p.id!==a.id)) }
  }

  async function completeTask(task){
    if(todoistToken &&!String(task.id).startsWith("custom-")){
      try{ await fetchWithProxy(`https://api.todoist.com/api/v1/tasks/${task.id}/close`, todoistToken, "POST") }catch{}
    }
    const entry={ id:Date.now(), date:new Date().toISOString().slice(0,10), title:(task.depth>0?"└ ":"")+task.content, source:"todoist", completed_at:new Date().toISOString() }
    setLogs(prev=>[entry,...prev]); setActive(prev=>prev.filter(p=>p.id!==task.id)); setPool(prev=>prev.filter(p=>p.id!==task.id && String(p.parent_id)!==String(task.id)))
  }

  function addCustom(){ if(!custom.trim()) return; const nt={ id:`custom-${Date.now()}`, content:custom.trim(), priority:2, depth:0 }; if(active.length<3) setActive(prev=>[...prev,nt]); else setPool(prev=>[nt,...prev]); setCustom("") }

  return (
    <div className={theme==="dark"?"dark":""}>
      <div className="min-h-screen bg-[#f8f8fb] dark:bg-[#0a0a0f] text-zinc-900 dark:text-zinc-100">
        <div className="max-w- mx-auto min-h-screen bg-white dark:bg-zinc-950 shadow-2xl flex flex-col">
          <div className="sticky top-0 z-20 backdrop-blur-xl bg-white/80 dark:bg-zinc-950/80 border-b px-5 flex justify-between" style={{ paddingTop:"calc(12px + env(safe-area-inset-top))", paddingBottom:"12px" }}>
            <div className="pt-2"><div className="text- tracking-widest text-zinc-400">TODAY · 하위업무 포함 · v1.11 API v1</div><div className="font-semibold text-">{new Date().toLocaleDateString("ko-KR",{month:"long",day:"numeric"})} · {status}</div></div>
            <button onClick={()=>setTheme(theme==="dark"?"light":"dark")} className="w-9 h-9 mt-2 rounded-full bg-zinc-100 dark:bg-zinc-800"> {theme==="dark"?"☀️":"🌙"} </button>
          </div>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd} onDragStart={e=>setActiveId(e.active.id)}>
            <div className="flex-1 px-4 py-4 space-y-5">
              <details open className="text-xs border rounded-xl p-3 bg-zinc-50 dark:bg-zinc-900">
                <summary className="font-medium cursor-pointer">🔑 Todoist API · {status}</summary>
                <div className="mt-3 space-y-2">
                  <div className="relative">
                    <input type={showToken?"text":"password"} value={todoistToken} onChange={e=>{ setTodoistToken(e.target.value); localStorage.setItem("todoist_token",e.target.value) }} placeholder="API token (**** 가림)" className="w-full px-3 py-2.5 pr-10 rounded-lg border bg-white dark:bg-zinc-950 text-xs tracking-widest" />
                    <button type="button" onClick={()=>setShowToken(!showToken)} className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-zinc-100 dark:bg-zinc-800">{showToken?"🙈":"👁️"}</button>
                  </div>
                  <input value={proxyUrl} onChange={e=>{ setProxyUrl(e.target.value); localStorage.setItem("todoist_proxy",e.target.value) }} className="w-full px-3 py-2 rounded-lg border bg-white dark:bg-zinc-950 text-" />
                  <div className="flex gap-2"><button onClick={fetchToday} className="flex-1 py-2 rounded-lg bg-zinc-900 dark:bg-white text-white dark:text-black text-xs">오늘 + 하위업무 불러오기</button><button onClick={()=>setShowSubtasks(!showSubtasks)} className="px-3 py-2 rounded-lg bg-zinc-200 dark:bg-zinc-800 text-xs">{showSubtasks?"하위 숨기기":"하위 보기"}</button></div>
                  {error && <div className="p-2 rounded bg-red-50 text-red-600 text- break-all">{error}</div>}
                  <div className="text- text-zinc-400">v1 API 적용 · 토큰 **** 가림 · 예시 데이터 없음</div>
                </div>
              </details>
              <div><h2 className="font-semibold mb-2">지금 하는 3개 ({active.length}/3)</h2>
                <SortableContext items={active.map(a=>a.id)} strategy={verticalListSortingStrategy}><div className="space-y-2 min-h- p-2 rounded-2xl border-2 border-dashed bg-zinc-50 dark:bg-zinc-900/50">{active.length===0 && <div className="text-center py-12 text-zinc-400 text-sm">오늘 일정 불러오면 여기에 3개가 채워져요</div>}{active.map((t,idx)=><div key={t.id} className="relative"><div className="absolute -left-1 -top-1 w-5 h-5 rounded-full bg-zinc-900 dark:bg-white text-white dark:text-black text- flex items-center justify-center font-bold z-10">{idx+1}</div><SortableItem task={t} isActive onComplete={completeTask} depth={t.depth} childCount={pool.filter(p=> String(p.parent_id)===String(t.id)).length} /></div>)}</div></SortableContext>
              </div>
              <div><div className="flex justify-between mb-2"><h2 className="font-semibold">오늘 풀 + 하위업무 ({filteredPool.length})</h2><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="검색" className="w-24 px-2 py-1 rounded-full bg-zinc-100 dark:bg-zinc-800 text-xs" /></div>
                <div id="pool-droppable" className="space-y-2 max-h- overflow-auto"><SortableContext items={filteredPool.map(a=>a.id)} strategy={verticalListSortingStrategy}>{filteredPool.map(t=>{ const childCount=pool.filter(p=> String(p.parent_id)===String(t.id)).length; return <SortableItem key={t.id} task={t} depth={t.depth} childCount={childCount} /> })}</SortableContext></div>
              </div>
            </div>
            <DragOverlay>{activeId? <div className="p-3 rounded-xl bg-white shadow-xl border text-sm">{pool.find(p=>p.id===activeId)?.content || active.find(a=>a.id===activeId)?.content}</div>:null}</DragOverlay>
          </DndContext>
        </div>
      </div>
    </div>
  )
}
