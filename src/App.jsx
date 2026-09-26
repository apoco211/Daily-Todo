import { useState, useEffect } from "react"
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragOverlay } from "@dnd-kit/core"
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
const pC={4:"bg-red-500",3:"bg-orange-400",2:"bg-blue-500",1:"bg-gray-300"};const pL={4:"P1",3:"P2",2:"P3",1:"P4"}
function SortableItem({task,isActive,onComplete,depth=0,childCount=0}){
 const {attributes,listeners,setNodeRef,transform,transition,isDragging}=useSortable({id:task.id})
 const style={transform:CSS.Transform.toString(transform),transition,opacity:isDragging?0.5:1,marginLeft:depth?`${depth*20}px`:"0px"}
 return(<div ref={setNodeRef} style={style} {...attributes} {...listeners} className={`flex items-center gap-3 p-3 rounded-xl border shadow-sm ${depth?"bg-zinc-50 dark:bg-zinc-800/50 border-l-2":"bg-white dark:bg-zinc-900"} ${isActive?"ring-2 ring-zinc-900":""}`}><div className="flex gap-2">{depth>0&&<span className="text-zinc-400 text-">└</span>}<div className={`w-2 h-2 rounded-full ${pC[task.priority]}`}/></div><span className={`flex-1 text- ${depth?"text-zinc-600":""}`}>{task.content}</span>{childCount>0&&<span className="text- px-1.5 py-0.5 rounded-full bg-blue-100">{childCount} 하위</span>}<span className="text- px-1.5 py-0.5 rounded bg-zinc-100">{pL[task.priority]}</span>{isActive&&<button onClick={()=>onComplete(task)} className="w-7 h-7 rounded-full bg-zinc-900 text-white">✓</button>}</div>)
}
function buildTaskTree(tasks){const m=new Map();tasks.forEach(t=>m.set(String(t.id),{...t,children:[],depth:0}));const r=[];tasks.forEach(t=>{const id=String(t.id);const pid=t.parent_id?String(t.parent_id):null;const n=m.get(id);if(pid&&m.has(pid)){const p=m.get(pid);n.depth=p.depth+1;p.children.push(n)}else r.push(n)});const f=[];const dfs=n=>{f.push(n);n.children.sort((a,b)=>(a.order||0)-(b.order||0));n.children.forEach(dfs)};r.sort((a,b)=>(a.order||0)-(b.order||0));r.forEach(dfs);return{flat:f}}
export default function App(){
 const [theme,setTheme]=useState(localStorage.getItem("theme")||"dark")
 const [pool,setPool]=useState([]);const [active,setActive]=useState([])
 const [logs,setLogs]=useState(()=>{try{return JSON.parse(localStorage.getItem("logs")||"[]")}catch{return[]}})
 const [custom,setCustom]=useState("");const [search,setSearch]=useState("")
 const [todoistToken,setTodoistToken]=useState(localStorage.getItem("todoist_token")||"")
 const [proxyUrl,setProxyUrl]=useState(localStorage.getItem("todoist_proxy")||"https://todoist-proxy.apoco211.workers.dev/")
 const [showToken,setShowToken]=useState(false);const [activeId,setActiveId]=useState(null)
 const [status,setStatus]=useState("API키 입력 후 불러오기");const [error,setError]=useState("");const [showSubtasks,setShowSubtasks]=useState(true)
 useEffect(()=>{document.documentElement.classList.toggle("dark",theme==="dark");localStorage.setItem("theme",theme)},[theme])
 useEffect(()=>{localStorage.setItem("logs",JSON.stringify(logs))},[logs])
 async function fetchWithProxy(target,token,method="GET",body=null){
  const headers={Authorization:`Bearer ${token}`};if(body)headers["Content-Type"]="application/json"
  const doFetch=async(url)=>{const res=await fetch(url,{method,headers,body:body?JSON.stringify(body):undefined,mode:"cors"});const txt=await res.text();if(!res.ok)throw new Error(`${res.status} ${txt.slice(0,400)}`);try{return JSON.parse(txt)}catch{return{}}}
  try{return await doFetch(target)}catch(e){if(!proxyUrl)throw e;const p=`${proxyUrl.replace(/\/$/,"")}?target=${encodeURIComponent(target)}`;return await doFetch(p)}
 }
 async function fetchToday(){
  if(!todoistToken){setStatus("토큰 없음");return}
  setStatus("불러오는 중...");setError("")
  try{
   const d=await fetchWithProxy("https://api.todoist.com/api/v1/tasks/filter?query=today%20%7C%20overdue",todoistToken,"GET")
   const today=d.results||[];let all=[...today]
   try{const sd=await fetchWithProxy("https://api.todoist.com/api/v1/tasks/filter?query=(today%20%7C%20overdue)%20%26%20subtask",todoistToken,"GET");(sd.results||[]).forEach(s=>{if(!all.find(a=>a.id===s.id))all.push(s)})}catch{}
   const {flat}=buildTaskTree(all.map(t=>({id:String(t.id),content:t.content,priority:t.priority||1,parent_id:t.parent_id?String(t.parent_id):null,order:t.child_order||t.order||0})))
   setPool(flat);if(active.length===0&&flat.length>0)setActive(flat.filter(f=>f.depth===0).slice(0,3))
   setStatus(`오늘 ${today.length}개 = 총 ${flat.length}개`)
  }catch(e){setStatus("실패");setError(String(e))}
 }
 useEffect(()=>{if(todoistToken)fetchToday()},[])
 const sensors=useSensors(useSensor(PointerSensor,{activationConstraint:{distance:8}}))
 const filtered=pool.filter(t=>!active.find(a=>a.id===t.id)).filter(t=>showSubtasks||t.depth===0).filter(t=>t.content.toLowerCase().includes(search.toLowerCase()))
 function handleDragEnd(e){const {active:a,over}=e;if(!over)return;if(active.find(x=>x.id===a.id)&&active.find(x=>x.id===over.id)){setActive(it=>{const oi=it.findIndex(i=>i.id===a.id);const ni=it.findIndex(i=>i.id===over.id);return arrayMove(it,oi,ni)});return}if(pool.find(x=>x.id===a.id)&&pool.find(x=>x.id===over.id)){setPool(it=>{const oi=it.findIndex(i=>i.id===a.id);const ni=it.findIndex(i=>i.id===over.id);return arrayMove(it,oi,ni)});return}if(pool.find(x=>x.id===a.id)&&active.find(x=>x.id===over.id)&&active.length<3){const t=pool.find(p=>p.id===a.id);if(t)setActive(p=>[...p,t]);return}if(active.find(x=>x.id===a.id)&&over.id==="pool-droppable"){setActive(p=>p.filter(x=>x.id!==a.id))}}
 async function completeTask(task){if(todoistToken&&!String(task.id).startsWith("custom-")){try{await fetchWithProxy(`https://api.todoist.com/api/v1/tasks/${task.id}/close`,todoistToken,"POST")}catch{}}const en={id:Date.now(),date:new Date().toISOString().slice(0,10),title:(task.depth>0?"└ ":"")+task.content};setLogs(p=>[en,...p]);setActive(p=>p.filter(x=>x.id!==task.id));setPool(p=>p.filter(x=>x.id!==task.id&&String(x.parent_id)!==String(task.id)))}
 function addCustom(){if(!custom.trim())return;const nt={id:`custom-${Date.now()}`,content:custom.trim(),priority:2,depth:0};if(active.length<3)setActive(p=>[...p,nt]);else setPool(p=>[nt,...p]);setCustom("")}
 return(<div className={theme==="dark"?"dark":""}><div className="min-h-screen bg-[#f8f8fb] dark:bg-[#0a0a0f]"><div className="max-w- mx-auto min-h-screen bg-white dark:bg-zinc-950 shadow-2xl flex flex-col"><div className="sticky top-0 z-20 border-b px-5 flex justify-between bg-white/80 dark:bg-zinc-950/80" style={{paddingTop:"calc(12px + env(safe-area-inset-top))"}}><div className="pt-2"><div className="text- text-zinc-400">TODAY · v1.12.2 · today|overdue</div><div className="font-semibold text-">{new Date().toLocaleDateString("ko-KR")} · {status}</div></div><button onClick={()=>setTheme(theme==="dark"?"light":"dark")} className="w-9 h-9 mt-2 rounded-full bg-zinc-100">{theme==="dark"?"☀️":"🌙"}</button></div><DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd} onDragStart={e=>setActiveId(e.active.id)}><div className="flex-1 px-4 py-4 space-y-5"><details open className="text-xs border rounded-xl p-3 bg-zinc-50 dark:bg-zinc-900"><summary className="font-medium">🔑 Todoist API · {status}</summary><div className="mt-3 space-y-2"><div className="relative"><input type={showToken?"text":"password"} value={todoistToken} onChange={e=>{setTodoistToken(e.target.value);localStorage.setItem("todoist_token",e.target.value)}} placeholder="API token" className="w-full px-3 py-2.5 pr-10 rounded-lg border text-xs"/><button type="button" onClick={()=>setShowToken(!showToken)} className="absolute right-2 top-1/2 -translate-y-1/2">{showToken?"🙈":"👁️"}</button></div><input value={proxyUrl} onChange={e=>{setProxyUrl(e.target.value);localStorage.setItem("todoist_proxy",e.target.value)}} className="w-full px-3 py-2 rounded-lg border text-"/><div className="flex gap-2"><button onClick={fetchToday} className="flex-1 py-2 rounded-lg bg-zinc-900 text-white text-xs">오늘 + 하위업무 불러오기</button><button onClick={()=>setShowSubtasks(!showSubtasks)} className="px-3 py-2 rounded-lg bg-zinc-200 text-xs">{showSubtasks?"숨기기":"보기"}</button></div>{error&&<div className="p-2 rounded bg-red-50 text-red-600 text- break-all">{error}</div>}</div></details><div><h2 className="font-semibold mb-2">지금 하는 3개 ({active.length}/3)</h2><SortableContext items={active.map(a=>a.id)} strategy={verticalListSortingStrategy}><div className="space-y-2 min-h- p-2 rounded-2xl border-2 border-dashed">{active.length===0&&<div className="text-center py-12 text-zinc-400 text-sm">오늘 일정 불러오면 여기에 3개 채워져요</div>}{active.map((t,i)=><div key={t.id} className="relative"><div className="absolute -left-1 -top-1 w-5 h-5 rounded-full bg-zinc-900 text-white text- flex items-center justify-center">{i+1}</div><SortableItem task={t} isActive onComplete={completeTask} depth={t.depth}/></div>)}</div></SortableContext></div><div><div className="flex justify-between mb-2"><h2 className="font-semibold">오늘 풀 ({filtered.length})</h2><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="검색" className="w-24 px-2 py-1 rounded-full bg-zinc-100 text-xs"/></div><div id="pool-droppable" className="space-y-2 max-h- overflow-auto"><SortableContext items={filtered.map(a=>a.id)} strategy={verticalListSortingStrategy}>{filtered.map(t=><SortableItem key={t.id} task={t} depth={t.depth}/>)}</SortableContext></div></div></div><DragOverlay>{activeId?<div className="p-3 rounded-xl bg-white shadow border text-sm">{pool.find(p=>p.id===activeId)?.content||active.find(a=>a.id===activeId)?.content}</div>:null}</DragOverlay></DndContext>

<div className="border-t bg-zinc-50 dark:bg-zinc-900/50">
<details open className="group">
<summary className="flex justify-between px-5 py-3 cursor-pointer list-none text- font-medium text-zinc-500">🛠️ 빌드 히스토리 · v1.12.2 <span className="group-open:rotate-180 transition">⌄</span></summary>
<div className="px-5 pb-4 space-y-2 text- text-zinc-600 dark:text-zinc-400">
<div className="flex gap-2"><span className="shrink-0 px-1.5 py-0.5 rounded bg-zinc-900 text-white">v1.12.2</span><span>2026-09-26 11:41</span><span>오늘 0개 수정 · today|overdue 필터로 Todoist 오늘 탭과 100% 동일화 · 밀린 업무 포함</span></div>
<div className="flex gap-2"><span className="shrink-0 px-1.5 py-0.5 rounded bg-zinc-200 dark:bg-zinc-700">v1.12.1</span><span>2026-09-26 11:30</span><span>빌드 히스토리 복구 · 파일 잘림 방지 압축 · GET API 유지</span></div>
<div className="flex gap-2"><span className="shrink-0 px-1.5 py-0.5 rounded bg-zinc-200 dark:bg-zinc-700">v1.12</span><span>2026-09-26 11:23</span><span>API v1 GET?query=today 적용 · 400 BAD_REQUEST 수정 · POST→GET 변경</span></div>
<div className="flex gap-2"><span className="shrink-0 px-1.5 py-0.5 rounded bg-zinc-200 dark:bg-zinc-700">v1.11</span><span>2026-09-26 11:13</span><span>API v1 마이그레이션 · rest/v2 410 Gone 대응 · Worker v2 배포 · 토큰 **** 가림 유지</span></div>
<div className="flex gap-2"><span className="shrink-0 px-1.5 py-0.5 rounded bg-zinc-200 dark:bg-zinc-700">v1.10</span><span>2026-09-26 11:00</span><span>토큰 **** 가림 + 눈 아이콘 + 프록시 기본값 + 빌드 에러 수정</span></div>
<div className="flex gap-2"><span className="shrink-0 px-1.5 py-0.5 rounded bg-zinc-200 dark:bg-zinc-700">v1.9</span><span>2026-09-26</span><span>하위업무 트리 buildTaskTree · 모의데이터 제거 · └ 표시</span></div>
<div className="flex gap-2"><span className="shrink-0 px-1.5 py-0.5 rounded bg-zinc-200 dark:bg-zinc-700">v1.8</span><span>2026-09-26</span><span>프록시 입력창 · CORS 대응 · Cloudflare Worker 연동 시작</span></div>
</div>
</details>
</div>

<div className="sticky bottom-0 border-t bg-white/90 dark:bg-zinc-950/90 backdrop-blur p-3 flex gap-2"><button className="flex-1 py-3 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-sm">📅 기록 보기</button><button onClick={()=>{if(confirm("logs 초기화?")){setLogs([]);localStorage.removeItem("logs")}}} className="px-4 py-3 rounded-xl bg-zinc-900 dark:bg-white text-white dark:text-black text-sm">초기화</button></div>
</div></div></div>)
}
