import { useState, useEffect, useMemo } from "react"
import { DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors, useDroppable, DragOverlay } from "@dnd-kit/core"
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"

const PROXY = "https://todoist-proxy.apoco211.workers.dev"
const VERSION = "v1.18.9"

const HOLIDAYS_2026 = {
  "01-01":"신정","02-16":"설날","02-17":"설날","02-18":"설날",
  "03-01":"삼일절","03-02":"삼일절","05-05":"어린이날",
  "05-24":"부처님오신날","05-25":"부처님오신날",
  "06-06":"현충일","08-15":"광복절","08-17":"광복절",
  "09-24":"추석","09-25":"추석","09-26":"추석",
  "10-03":"개천절","10-05":"개천절","10-09":"한글날","12-25":"크리스마스"
}

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

function SortableItem({ task, parentContent, isTop, isCandidate, hasChildren, expanded, onToggle, onMoveTop, onMoveDown, onComplete, onDelete, childrenList, descExpanded, onToggleDesc }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging?0.6:1, zIndex: isDragging?20:0 }
  let cardClass = "rounded-lg px-2 py-1 flex flex-col gap-0.5 bg-white border border-gray-200 dark:bg-gray-800 dark:border-gray-700"
  if (isTop) cardClass = "rounded-lg px-2 py-1 flex flex-col gap-0.5 bg-blue-100 border border-blue-300 dark:bg-blue-900/40 dark:border-blue-400"
  if (isCandidate) cardClass = "rounded-lg px-2 py-1 flex flex-col gap-0.5 bg-yellow-50 border border-yellow-200 dark:bg-amber-900/30 dark:border-yellow-400/60"
  const hasDesc =!!(task.description && task.description.trim().length>0)
  return (
    <div ref={setNodeRef} style={style} className={`${cardClass} relative`}>
      {isCandidate && <span className="absolute -top-1 -right-1 text-[7px] bg-amber-400 text-amber-900 px-1 py-0 rounded-full font-bold shadow">다음 후보</span>}
      <div className="flex items-center gap-1">
        <button {...attributes} {...listeners} style={{touchAction:'none'}} className="w-5 h-5 flex items-center justify-center text-gray-400 dark:text-gray-300 cursor-grab text-[11px] touch-none select-none shrink-0">≡</button>
        <div className="flex-1 min-w-0 cursor-pointer" onClick={()=>{if(hasDesc) onToggleDesc(task.id)}} onTouchStart={e=>{if(hasDesc) e.stopPropagation()}}>
          {parentContent && <div className="text-[8px] text-gray-500 dark:text-gray-400 leading-none truncate">{parentContent} ▸</div>}
          <div className="flex items-center gap-1">
            <div className="text-[11px] leading-[1.15] text-gray-900 dark:text-white truncate font-medium flex-1">{task.content}</div>
            {hasDesc && <span className="text-[8px] text-gray-400 shrink-0">📝</span>}
          </div>
          {hasChildren &&!isTop &&!expanded && <div className="text-[8px] text-gray-500 leading-none">{childrenList?.length}개 하위</div>}
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          {!isTop? (
            <>
              <button onTouchStart={e=>e.stopPropagation()} onClick={()=>onComplete(task.id)} className="w-5 h-5 bg-black dark:bg-white text-white dark:text-black rounded text-[9px] font-bold">✓</button>
              <button onTouchStart={e=>e.stopPropagation()} onClick={()=>onMoveTop(task.id)} className="w-5 h-5 bg-blue-500 text-white rounded text-[9px] font-bold">▲</button>
              {hasChildren && <button onTouchStart={e=>e.stopPropagation()} onClick={()=>onToggle(task.id)} className="w-5 h-5 bg-gray-200 dark:bg-gray-600 dark:text-white rounded text-[8px]">{expanded?'▲':'▼'}</button>}
              <button onTouchStart={e=>e.stopPropagation()} onClick={()=>onDelete(task.id)} className="w-5 h-5 bg-gray-100 dark:bg-gray-700 dark:text-white rounded text-[8px]">✕</button>
            </>
          ) : (
            <>
              <button onTouchStart={e=>e.stopPropagation()} onClick={()=>onComplete(task.id)} className="w-5 h-5 bg-black dark:bg-white text-white dark:text-black rounded text-[9px] font-bold">✓</button>
              <button onTouchStart={e=>e.stopPropagation()} onClick={()=>onMoveDown(task.id)} className="w-5 h-5 bg-gray-100 dark:bg-gray-600 dark:text-white rounded text-[8px]">▼</button>
            </>
          )}
        </div>
      </div>
      {hasDesc && descExpanded && (
        <div onTouchStart={e=>e.stopPropagation()} onClick={e=>e.stopPropagation()} className="mt-1 ml-6 mr-0.5 p-1.5 rounded bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 select-text">
          <div className="text-[10px] text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-words select-text leading-[1.35]" style={{WebkitUserSelect:'text',userSelect:'text'}}>{task.description}</div>
          <div className="text-[7px] text-gray-400 mt-1">드래그해서 부분 복사</div>
        </div>
      )}
      {!isTop && expanded && childrenList?.length>0 && (
        <div className="ml-3 pl-2 border-l-2 border-gray-300 dark:border-gray-600 flex flex-col gap-0.5 mt-0.5">
          {childrenList.map(child=>{
            const cd=!!(child.description&&child.description.trim().length>0)
            return (
            <div key={child.id} className="flex items-center justify-between py-0.5 bg-gray-50 dark:bg-gray-900/50 rounded px-1">
              <div className="min-w-0 flex-1 cursor-pointer" onClick={()=>{if(cd) onToggleDesc(child.id)}}>
                <div className="text-[7px] text-gray-400 truncate">{task.content} ▸ {cd&&<span>📝</span>}</div>
                <div className="text-[10px] text-gray-800 dark:text-gray-200 truncate">{child.content}</div>
              </div>
              <div className="flex gap-0.5 ml-1">
                <button onClick={()=>onComplete(child.id)} className="w-5 h-5 bg-black dark:bg-white text-white dark:text-black rounded text-[8px]">✓</button>
                <button onClick={()=>onMoveTop(child.id)} className="w-5 h-5 bg-blue-500 text-white rounded text-[8px]">▲</button>
              </div>
            </div>
          )})}
        </div>
      )}
      {isTop && childrenList?.length>0 && (
        <div className="ml-2 pl-1.5 border-l-2 border-blue-300 dark:border-blue-400 flex flex-col gap-0.5 mt-0.5">
          <div className="text-[7px] text-blue-700 dark:text-blue-300">{childrenList.length}개 하위</div>
          {childrenList.map(ch=>(
            <div key={ch.id} className="flex items-center justify-between bg-white/70 dark:bg-gray-800/70 rounded px-1 py-0">
              <span className="text-[9px] text-gray-800 dark:text-gray-100 truncate flex-1">• {ch.content}</span>
              <button onClick={()=>onComplete(ch.id)} className="ml-1 w-4 h-4 bg-black dark:bg-white text-white dark:text-black rounded text-[7px]">✓</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function TopDrop({ children, isOver }){
  const { setNodeRef } = useDroppable({ id: "top-container" })
  return <div ref={setNodeRef} className={`rounded-lg border border-dashed p-1 min-h-[80px] ${isOver?'border-blue-500 bg-blue-50/50 dark:bg-blue-900/20':'border-gray-300 dark:border-gray-600'}`}>{children}</div>
}

export default function App(){
  const [tasks,setTasks]=useState([])
  const [top3Ids,setTop3Ids]=useState(()=>{const m=JSON.parse(localStorage.getItem("top3Ids")||"[]");const b=JSON.parse(localStorage.getItem("top3Ids_backup")||"[]");return m.length?m:b})
  const [poolOrder,setPoolOrder]=useState(()=>{const m=JSON.parse(localStorage.getItem("poolOrder")||"[]");const b=JSON.parse(localStorage.getItem("poolOrder_backup")||"[]");return m.length?m:b})
  const [logs,setLogs]=useState(()=>JSON.parse(localStorage.getItem("completed_logs")||"[]"))
  const [token,setToken]=useState(()=>localStorage.getItem("todoist_token")||"")
  const [activeTab,setActiveTab]=useState("today")
  const [expandedIds,setExpandedIds]=useState(new Set())
  const [descExpandedIds,setDescExpandedIds]=useState(new Set())
  const [dark,setDark]=useState(()=>localStorage.getItem("dark")==="true")
  const [newContent,setNewContent]=useState("")
  const [newPri,setNewPri]=useState(1)
  const [newParent,setNewParent]=useState("")
  const [showToken,setShowToken]=useState(false)
  const [tmpToken,setTmpToken]=useState(token)
  const [completedFromTodoist,setCompletedFromTodoist]=useState([])
  const [activeId,setActiveId]=useState(null)
  const [isOverTop,setIsOverTop]=useState(false)

  const sensors=useSensors(useSensor(PointerSensor,{activationConstraint:{distance:8}}),useSensor(TouchSensor,{activationConstraint:{delay:200,tolerance:6}}))
  const taskMap=useMemo(()=>{const m={};tasks.forEach(t=>m[t.id]=t);return m},[tasks])

  const dateInfo=useMemo(()=>{
    const now=new Date();const y=now.getFullYear(),m=now.getMonth()+1,d=now.getDate()
    const dayIdx=now.getDay();const week=["일","월","화","수","목","금","토"][dayIdx]
    const key=`${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`
    const holiday=HOLIDAYS_2026[key];const isSat=dayIdx===6,isSun=dayIdx===0
    let weekColor="text-gray-900 dark:text-white";let labelColor="text-blue-600 dark:text-blue-400";let label=""
    if(holiday){weekColor="text-red-600 dark:text-red-400";labelColor="text-red-600 dark:text-red-400";label=`[${holiday}]`}
    else if(isSat){weekColor="text-blue-600 dark:text-blue-400";label="[주말]"}
    else if(isSun){weekColor="text-red-600 dark:text-red-400";label="[주말]"}else{label="[평일]"}
    return{dateText:`${y}년 ${m}월${d}일`,weekText:`(${week})`,weekColor,label,labelColor}
  },[])

  useEffect(()=>{if(top3Ids.length>0){localStorage.setItem("top3Ids",JSON.stringify(top3Ids));localStorage.setItem("top3Ids_backup",JSON.stringify(top3Ids))}},[top3Ids])
  useEffect(()=>{if(poolOrder.length>0){localStorage.setItem("poolOrder",JSON.stringify(poolOrder));localStorage.setItem("poolOrder_backup",JSON.stringify(poolOrder))}},[poolOrder])
  useEffect(()=>{localStorage.setItem("completed_logs",JSON.stringify(logs))},[logs])
  useEffect(()=>{localStorage.setItem("dark",String(dark));if(dark)document.documentElement.classList.add("dark");else document.documentElement.classList.remove("dark")},[dark])

  const getChildren=(parentId)=>tasks.filter(t=>t.parent_id===parentId)

  const fetchTasks=async(tok=token)=>{
    const useToken=tok||token;if(!useToken)return
    try{
      const res=await fetch(`${PROXY}/api/v1/tasks/filter?query=today%20|%20overdue`,{headers:{Authorization:`Bearer ${useToken}`}})
      const data=await res.json();const todays=data.results||data.tasks||data||[]
      const childResults=await Promise.all(todays.map(async t=>{try{const r=await fetch(`${PROXY}/api/v1/tasks?parent_id=${t.id}`,{headers:{Authorization:`Bearer ${useToken}`}});const d=await r.json();return d.results||d.tasks||(Array.isArray(d)?d:[])}catch{return[]}}))
      const merged={};[...todays,...childResults.flat()].forEach(t=>{merged[t.id]=t});let all=Object.values(merged)
      const savedPoolRaw=localStorage.getItem("poolOrder");const savedPoolBackupRaw=localStorage.getItem("poolOrder_backup")
      const savedPoolParsed=JSON.parse(savedPoolRaw||"[]");const savedPoolBackupParsed=JSON.parse(savedPoolBackupRaw||"[]")
      const savedPool=savedPoolParsed.length?savedPoolParsed:savedPoolBackupParsed
      const savedTopRaw=localStorage.getItem("top3Ids");const savedTopBackupRaw=localStorage.getItem("top3Ids_backup")
      const savedTopParsed=JSON.parse(savedTopRaw||"[]");const savedTopBackupParsed=JSON.parse(savedTopBackupRaw||"[]")
      const savedTop=savedTopParsed.length?savedTopParsed:savedTopBackupParsed
      const topRootsSet=new Set(savedTop.map(id=>{const t=merged[id];return t?getRootId(t,merged):null}).filter(Boolean))
      if(savedPool.length>0){const orderMap=new Map(savedPool.map((id,idx)=>[id,idx]));all=[...all].sort((a,b)=>{const aIsParent=!a.parent_id||!merged[a.parent_id];const bIsParent=!b.parent_id||!merged[b.parent_id];if(!aIsParent||!bIsParent)return 0;if(topRootsSet.has(a.id)||topRootsSet.has(getRootId(a,merged)))return 9998;if(topRootsSet.has(b.id)||topRootsSet.has(getRootId(b,merged)))return 9998;const aIdx=orderMap.has(a.id)?orderMap.get(a.id):(orderMap.has(getRootId(a,merged))?orderMap.get(getRootId(a,merged)):9999);const bIdx=orderMap.has(b.id)?orderMap.get(b.id):(orderMap.has(getRootId(b,merged))?orderMap.get(getRootId(b,merged)):9999);return aIdx-bIdx})}
      setTasks(all)
      setTop3Ids(prev=>{const cur=prev.length?prev:savedTop;const filtered=cur.filter(id=>merged[id]);const seen=new Set();const dedup=[];for(const id of filtered){const root=getRootId(merged[id],merged);if(!seen.has(root)){seen.add(root);dedup.push(id)}}return dedup.slice(0,3)})
      const existingIds=new Set([...savedPool,...savedTop]);const newIds=all.filter(t=>!t.parent_id||!merged[t.parent_id]).filter(t=>!existingIds.has(t.id)&&!topRootsSet.has(getRootId(t,merged))).map(t=>t.id)
      if(newIds.length>0){const updated=[...newIds,...savedPool];if(updated.length>0)setPoolOrder(updated)}else if(savedPool.length>0&&poolOrder.length===0){setPoolOrder(savedPool)}
    }catch(e){console.error(e)}
  }

  const fetchCompleted=async()=>{if(!token)return;try{const since=new Date(Date.now()-7*86400000).toISOString();const res=await fetch(`${PROXY}/api/v1/completed/get_all?since=${encodeURIComponent(since)}&limit=100`,{headers:{Authorization:`Bearer ${token}`}});const data=await res.json();setCompletedFromTodoist(data.items||[])}catch{}}
  useEffect(()=>{if(token)fetchTasks(token)},[])
  useEffect(()=>{if(activeTab==="history")fetchCompleted()},[activeTab])

  const getTop3GroupCount=()=>{const s=new Set();top3Ids.forEach(id=>{const t=taskMap[id];if(t)s.add(getRootId(t,taskMap))});return s.size}
  const moveToTop=(id)=>{const t=taskMap[id];if(!t)return;const root=getRootId(t,taskMap);const existing=new Set(top3Ids.map(tid=>taskMap[tid]?getRootId(taskMap[tid],taskMap):null).filter(Boolean));if(existing.has(root))return;if(getTop3GroupCount()>=3){alert("Top3는 최대 3개!");return}setTop3Ids(p=>[...p,id]);setPoolOrder(p=>p.filter(x=>x!==id&&x!==root))}
  const moveDown=(id)=>{setTop3Ids(p=>p.filter(x=>x!==id));setPoolOrder(p=>[id,...p])}
  const deleteLocal=(id)=>{const toRemove=new Set([id]);tasks.forEach(t=>{if(t.parent_id===id)toRemove.add(t.id)});setTasks(p=>p.filter(t=>!toRemove.has(t.id)));setTop3Ids(p=>p.filter(t=>!toRemove.has(t)));setPoolOrder(p=>p.filter(t=>!toRemove.has(t)))}
  const completeTask=async(id)=>{const t=taskMap[id];if(!t)return;const toComplete=getChildren(id).length?[t,...getChildren(id)]:[t];try{for(const c of toComplete){await fetch(`${PROXY}/api/v1/tasks/${c.id}/close`,{method:"POST",headers:{Authorization:`Bearer ${token}`}})}}catch(e){console.error(e)}const now=new Date();const dk=now.toISOString().slice(0,10);setLogs(p=>[...toComplete.map(x=>({id:x.id,content:x.content,completedAt:now.toISOString(),dateKey:dk})),...p]);const rem=new Set(toComplete.map(x=>x.id));setTasks(p=>p.filter(x=>!rem.has(x.id)));setTop3Ids(p=>p.filter(x=>!rem.has(x)));setPoolOrder(p=>p.filter(x=>!rem.has(x)))}
  const addTask=async()=>{if(!newContent.trim())return;try{const res=await fetch(`${PROXY}/api/v1/tasks`,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${token}`},body:JSON.stringify({content:newContent,priority:newPri,parent_id:newParent||undefined})});const created=await res.json();setTasks(p=>[created,...p]);setPoolOrder(p=>[created.id,...p]);setNewContent("");setNewParent("")}catch{alert("추가 실패")}}

  const topRoots=useMemo(()=>{const s=new Set();top3Ids.forEach(id=>{const t=taskMap[id];if(t)s.add(getRootId(t,taskMap))});return s},[top3Ids,taskMap])
  const poolTasks=useMemo(()=>{let filtered=tasks.filter(t=>{const root=getRootId(t,taskMap);if(topRoots.has(root))return false;if(t.parent_id&&taskMap[t.parent_id])return false;return true});const orderSrc=poolOrder.length?poolOrder:JSON.parse(localStorage.getItem("poolOrder_backup")||"[]");if(orderSrc.length>0){const orderMap=new Map(orderSrc.map((id,idx)=>[id,idx]));filtered=[...filtered].sort((a,b)=>{const aIdx=orderMap.has(a.id)?orderMap.get(a.id):(orderMap.has(getRootId(a,taskMap))?orderMap.get(getRootId(a,taskMap)):9999);const bIdx=orderMap.has(b.id)?orderMap.get(b.id):(orderMap.has(getRootId(b,taskMap))?orderMap.get(getRootId(b,taskMap)):9999);return aIdx-bIdx})}return filtered},[tasks,topRoots,taskMap,poolOrder])

  const groupedLogs=useMemo(()=>{const all=[...logs];completedFromTodoist.forEach(c=>{const dk=(c.completed_at||"").slice(0,10);if(dk)all.push({id:c.task_id||c.id,content:c.content,completedAt:c.completed_at,dateKey:dk})});const map=new Map();all.forEach(l=>{const k=l.id+"_"+l.dateKey;if(!map.has(k))map.set(k,l)});const arr=Array.from(map.values()).sort((a,b)=>new Date(b.completedAt)-new Date(a.completedAt));const grouped={};arr.forEach(l=>{if(!grouped[l.dateKey])grouped[l.dateKey]=[];grouped[l.dateKey].push(l)});return Object.entries(grouped).sort((a,b)=>b[0].localeCompare(a[0]))},[logs,completedFromTodoist])

  return (
    <div className={`min-h-screen bg-gray-50 dark:bg-gray-950 flex justify-center ${dark?'dark':''}`}>
      <div className="w-full max-w-[430px] bg-white dark:bg-gray-900 min-h-screen shadow-xl flex flex-col" style={{paddingTop:"env(safe-area-inset-top)"}}>
        <header className="flex justify-between items-center px-2 py-1 border-b dark:border-gray-800">
          <div className="text-[8px] font-bold text-gray-400 shrink-0">{VERSION}</div>
          <div className="flex-1 text-center text-[12px] font-bold">
            <span className="text-gray-900 dark:text-white">{dateInfo.dateText} </span>
            <span className={dateInfo.weekColor}>{dateInfo.weekText}</span>
            <span className={`${dateInfo.labelColor} text-[9px] ml-1`}>{dateInfo.label}</span>
          </div>
          <div className="flex gap-0.5 shrink-0">
            <button onClick={()=>setShowToken(!showToken)} className="w-5 h-5 rounded-full bg-gray-100 dark:bg-gray-800 text-[9px]">⚙️</button>
            <button onClick={()=>setDark(!dark)} className="w-5 h-5 rounded-full bg-gray-100 dark:bg-gray-800 text-[9px]">{dark?'☀️':'🌙'}</button>
          </div>
        </header>
        {showToken && <div className="p-1.5 bg-gray-50 dark:bg-gray-800 border-b dark:border-gray-700 flex flex-col gap-1"><div className="flex gap-1"><input type="password" value={tmpToken} onChange={e=>setTmpToken(e.target.value)} placeholder="토큰" className="flex-1 px-2 py-1 rounded border text-[9px] dark:bg-gray-700 dark:text-white"/><button onClick={()=>{localStorage.setItem("todoist_token",tmpToken);setToken(tmpToken);setShowToken(false);setTimeout(()=>fetchTasks(tmpToken),200)}} className="bg-black dark:bg-white text-white dark:text-black px-2 rounded text-[9px]">저장</button></div><div className="flex gap-1"><button onClick={()=>fetchTasks()} className="flex-1 bg-blue-500 text-white py-1 rounded text-[9px]">🔄 다시 불러오기</button><button onClick={()=>{setTmpToken("");localStorage.removeItem("todoist_token");setToken("");setTasks([])}} className="flex-1 bg-gray-200 dark:bg-gray-700 dark:text-white py-1 rounded text-[9px]">토큰 삭제</button></div></div>}
        <div className="flex border-b dark:border-gray-800">{["today","history","changelog"].map(tab=><button key={tab} onClick={()=>setActiveTab(tab)} className={`flex-1 py-1 text-[10px] ${activeTab===tab?'border-b-2 border-black dark:border-white font-bold text-gray-900 dark:text-white':'text-gray-500 dark:text-gray-400'}`}>{tab==="today"?"오늘 할 일":tab==="history"?"날짜별 완료":"히스토리"}</button>)}</div>
        {activeTab==="today" && <div className="flex-1 overflow-auto p-1 flex flex-col gap-1.5">
          <div className="flex gap-0.5"><input value={newContent} onChange={e=>setNewContent(e.target.value)} placeholder="추가업무" className="flex-1 px-2 py-1 rounded border bg-blue-50/50 dark:bg-gray-800 border-blue-100 dark:border-gray-700 text-[10px] text-gray-900 dark:text-white"/><select value={newPri} onChange={e=>setNewPri(Number(e.target.value))} className="px-1 rounded border text-[9px] dark:bg-gray-800 dark:text-white"><option value={1}>P4</option><option value={2}>P3</option><option value={3}>P2</option><option value={4}>P1</option></select><select value={newParent} onChange={e=>setNewParent(e.target.value)} className="px-1 rounded border text-[9px] dark:bg-gray-800 dark:text-white max-w-[60px]"><option value="">부모없음</option>{tasks.filter(t=>!t.parent_id).map(t=><option key={t.id} value={t.id}>{t.content.slice(0,10)}</option>)}</select><button onClick={addTask} className="bg-blue-500 text-white px-2 rounded text-[11px]">+</button></div>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={e=>setActiveId(e.active.id)} onDragOver={e=>setIsOverTop(e.over?.id==="top-container")} onDragEnd={e=>{const {active,over}=e;setActiveId(null);setIsOverTop(false);if(!over)return;if(over.id==="top-container"){moveToTop(active.id);return}const aIdx=poolTasks.findIndex(t=>t.id===active.id);const oIdx=poolTasks.findIndex(t=>t.id===over.id);if(aIdx!==-1&&oIdx!==-1){const newPool=arrayMove(poolTasks,aIdx,oIdx);if(newPool.length>0)setPoolOrder(newPool.map(t=>t.id));const other=tasks.filter(t=>!poolTasks.find(p=>p.id===t.id));let rebuilt=[];newPool.forEach(p=>{rebuilt.push(p);getChildren(p.id).forEach(c=>rebuilt.push(c))});setTasks([...rebuilt,...other.filter(o=>!rebuilt.find(r=>r.id===o.id))]);return}if(top3Ids.includes(active.id)&&top3Ids.includes(over.id)){setTop3Ids(prev=>arrayMove(prev,prev.indexOf(active.id),prev.indexOf(over.id)))}}}>
            <div className="flex flex-col gap-0.5"><div className="text-[10px] font-bold text-gray-900 dark:text-white">🎯 Top3 ({getTop3GroupCount()}/3) <span className="text-[8px] font-normal text-blue-600 ml-1">파란색</span></div><TopDrop isOver={isOverTop}><SortableContext items={top3Ids} strategy={verticalListSortingStrategy}><div className="flex flex-col gap-0.5">{top3Ids.length===0?<div className="text-center text-gray-400 text-[10px] py-3">▲로 올리기</div>:top3Ids.map(id=>{const t=taskMap[id];if(!t)return null;const pn=t.parent_id&&taskMap[t.parent_id]?taskMap[t.parent_id].content:undefined;return <SortableItem key={id} task={t} parentContent={pn} isTop={true} hasChildren={getChildren(id).length>0} childrenList={getChildren(id)} onComplete={completeTask} onMoveDown={moveDown} onDelete={deleteLocal} descExpanded={descExpandedIds.has(t.id)} onToggleDesc={tid=>setDescExpandedIds(s=>{const n=new Set(s);n.has(tid)?n.delete(tid):n.add(tid);return n})}/>})}</div></SortableContext></TopDrop></div>
            <div className="flex flex-col gap-0.5 mt-0.5"><div className="text-[10px] font-bold text-gray-900 dark:text-white">📋 오늘 풀 ({poolTasks.length}) <span className="text-[8px] font-normal text-amber-600 ml-1">노란 상위3 / 바로 ✓</span></div><SortableContext items={poolTasks.map(t=>t.id)} strategy={verticalListSortingStrategy}><div className="flex flex-col gap-0.5">{poolTasks.map((t,idx)=>{const children=getChildren(t.id);return <SortableItem key={t.id} task={t} isCandidate={idx<3} hasChildren={children.length>0} expanded={expandedIds.has(t.id)} childrenList={children} onToggle={pid=>setExpandedIds(s=>{const n=new Set(s);n.has(pid)?n.delete(pid):n.add(pid);return n})} onMoveTop={moveToTop} onDelete={deleteLocal} onComplete={completeTask} descExpanded={descExpandedIds.has(t.id)} onToggleDesc={tid=>setDescExpandedIds(s=>{const n=new Set(s);n.has(tid)?n.delete(tid):n.add(tid);return n})}/>})}</div></SortableContext></div>
            <DragOverlay>{activeId?<div className="rounded p-1.5 bg-white dark:bg-gray-800 border border-blue-500 shadow text-[10px]">{taskMap[activeId]?.content}</div>:null}</DragOverlay>
          </DndContext>
        </div>}
        {activeTab==="history"&&<div className="flex-1 overflow-auto p-1">{groupedLogs.map(([date,items])=><div key={date} className="border dark:border-gray-700 rounded p-1 bg-gray-50 dark:bg-gray-800/50 mb-1"><div className="font-bold text-[9px] mb-0.5 text-gray-900 dark:text-white">{date} ({items.length})</div><div className="flex flex-col gap-0.5">{items.map(it=><div key={it.id+"_"+it.completedAt} className="text-[10px] bg-white dark:bg-gray-900 rounded px-1 py-0.5 border dark:border-gray-700 text-gray-900 dark:text-gray-100 truncate">{it.content}</div>)}</div></div>)}</div>}
        {activeTab==="changelog"&&<div className="p-1 text-[9px] text-gray-700 dark:text-gray-300"><div>v1.18.9 - 컴팩트 복구 (카드 높이/폰트/아이콘 축소)</div><div>v1.18.8 - 풀 바로완료 + 설명보기</div></div>}
      </div>
    </div>
  )
}