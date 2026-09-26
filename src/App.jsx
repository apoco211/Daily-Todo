import { useState, useEffect } from 'react'
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragOverlay } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

const priorityColor = { 4: 'bg-red-500', 3: 'bg-orange-400', 2: 'bg-blue-500', 1: 'bg-gray-300' }
const priorityLabel = { 4: 'P1', 3: 'P2', 2: 'P3', 1: 'P4' }

function SortableItem({ task, isActive, onComplete, depth = 0, childCount = 0 }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id })
  const isSubtask = depth > 0
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging? 0.5 : 1, marginLeft: isSubtask? `${depth * 20}px` : '0px' }
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}
      className={`group flex items-center gap-3 p-3 rounded-xl border shadow-sm ${isSubtask? 'bg-zinc-50 dark:bg-zinc-800/50 border-l-2 border-l-zinc-400 dark:border-l-zinc-600 border-zinc-200 dark:border-zinc-800' : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800'} ${isActive? 'ring-2 ring-zinc-900 dark:ring-white' : ''}`}>
      <div className="flex items-center gap-2">
        {isSubtask && <span className="text-zinc-400 text-">└</span>}
        <div className={`w-2 h-2 rounded-full ${priorityColor[task.priority]}`} />
      </div>
      <span className={`flex-1 text- ${isSubtask? 'text- text-zinc-600 dark:text-zinc-300' : 'text-zinc-800 dark:text-zinc-100'}`}>{task.content}</span>
      {childCount > 0 && <span className="text- px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300">{childCount} 하위</span>}
      <span className="text- px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500">{priorityLabel[task.priority]}</span>
      {isActive && <button onClick={() => onComplete(task)} className="ml-1 w-7 h-7 rounded-full bg-zinc-900 dark:bg-white text-white dark:text-black flex items-center justify-center">✓</button>}
    </div>
  )
}

function buildTaskTree(tasks) {
  const map = new Map()
  tasks.forEach(t => map.set(String(t.id), {...t, children: [], depth: 0 }))
  const roots = []
  tasks.forEach(t => {
    const id = String(t.id)
    const parentId = t.parent_id? String(t.parent_id) : null
    const node = map.get(id)
    if (parentId && map.has(parentId)) {
      const parent = map.get(parentId)
      node.depth = parent.depth + 1
      parent.children.push(node)
    } else {
      roots.push(node)
    }
  })
  const flat = []
  function dfs(node) { flat.push(node); node.children.sort((a,b)=>(a.order||0)-(b.order||0)); node.children.forEach(dfs) }
  roots.sort((a,b)=>(a.order||0)-(b.order||0))
  roots.forEach(dfs)
  return { flat, roots }
}

export default function App() {
  const [theme, setTheme] = useState(localStorage.getItem('theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches? 'dark' : 'light'))
  const [pool, setPool] = useState([])
  const [active, setActive] = useState([])
  const [logs, setLogs] = useState(JSON.parse(localStorage.getItem('logs') || '[]'))
  const [custom, setCustom] = useState('')
  const [search, setSearch] = useState('')
  const [todoistToken, setTodoistToken] = useState(localStorage.getItem('todoist_token') || '')
  const [proxyUrl, setProxyUrl] = useState(localStorage.getItem('todoist_proxy') || '')
  const [activeId, setActiveId] = useState(null)
  const [status, setStatus] = useState('API키를 입력하면 오늘 + 하위업무를 가져와요')
  const [error, setError] = useState('')
  const [showSubtasks, setShowSubtasks] = useState(true)

  useEffect(() => { document.documentElement.classList.toggle('dark', theme === 'dark'); localStorage.setItem('theme', theme) }, [theme])
  useEffect(() => { localStorage.setItem('logs', JSON.stringify(logs)) }, [logs])

  async function fetchWithProxy(url, token) {
    const headers = { Authorization: `Bearer ${token}` }
    try {
      const res = await fetch(url, { headers, mode: 'cors' })
      if (!res.ok) throw new Error(res.status)
      return await res.json()
    } catch (e) {
      if (!proxyUrl) throw e
      const pUrl = `${proxyUrl.replace(/\/$/, '')}?target=${encodeURIComponent(url)}`
      const res2 = await fetch(pUrl, { headers, mode: 'cors' })
      if (!res2.ok) throw new Error('proxy ' + res2.status)
      return await res2.json()
    }
  }

  async function fetchToday() {
    if (!todoistToken) { setStatus('토큰 없음'); return }
    setStatus('불러오는 중... (하위업무 포함)'); setError('')
    try {
      const todayTasks = await fetchWithProxy('https://api.todoist.com/rest/v2/tasks?filter=today', todoistToken)
      let allSubtasks = []
      if (todayTasks.length > 0) {
        const projectIds = [...new Set(todayTasks.map(t => t.project_id).filter(Boolean))]
        for (const pid of projectIds.slice(0,5)) {
          try {
            const pTasks = await fetchWithProxy(`https://api.todoist.com/rest/v2/tasks?project_id=${pid}`, todoistToken)
            const subs = pTasks.filter(t => t.parent_id && todayTasks.some(tt => String(tt.id) === String(t.parent_id)))
            allSubtasks.push(...subs)
          } catch {}
        }
      }
      const combined = [...todayTasks,...allSubtasks]
      const uniqueMap = new Map()
      combined.forEach(t => uniqueMap.set(String(t.id), t))
      const unique = Array.from(uniqueMap.values())
      const { flat } = buildTaskTree(unique.map(t => ({ id: String(t.id), content: t.content, priority: t.priority, parent_id: t.parent_id? String(t.parent_id) : null, order: t.order, project_id: t.project_id })))
      setPool(flat)
      if (active.length === 0 && flat.length > 0) {
        const roots = flat.filter(f => f.depth === 0)
        setActive(roots.slice(0,3))
      }
      setStatus(`오늘 ${todayTasks.length}개 + 하위 ${allSubtasks.length}개 = 총 ${flat.length}개`)
    } catch (e) { setStatus('실패'); setError(String(e)) }
  }

  useEffect(() => { if (todoistToken) fetchToday() }, [])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))
  const filteredPool = pool.filter(t =>!active.find(a => a.id === t.id)).filter(t => showSubtasks || t.depth === 0).filter(t => t.content.toLowerCase().includes(search.toLowerCase()))

  function handleDragEnd(event) {
    const { active: a, over } = event; if (!over) return
    if (active.find(x => x.id === a.id) && active.find(x => x.id === over.id)) {
      setActive(items => { const oi = items.findIndex(i => i.id === a.id); const ni = items.findIndex(i => i.id === over.id); return arrayMove(items, oi, ni) }); return
    }
    if (pool.find(x => x.id === a.id) && pool.find(x => x.id === over.id)) {
      setPool(items => { const oi = items.findIndex(i => i.id === a.id); const ni = items.findIndex(i => i.id === over.id); return arrayMove(items, oi, ni) }); return
    }
    if (pool.find(x => x.id === a.id) && active.find(x => x.id === over.id) && active.length < 3) {
      const task = pool.find(p => p.id === a.id); if (task) setActive(prev => [...prev, task]); return
    }
    if (active.find(x => x.id === a.id) && over.id === 'pool-droppable') {
      setActive(prev => prev.filter(p => p.id!== a.id))
    }
  }

  async function completeTask(task) {
    if (todoistToken &&!String(task.id).startsWith('custom-')) {
      const url = `https://api.todoist.com/rest/v2/tasks/${task.id}/close`
      try {
        if (proxyUrl) {
          await fetch(`${proxyUrl}?target=${encodeURIComponent(url)}`, { method: 'POST', headers: { Authorization: `Bearer ${todoistToken}` }, mode: 'cors' })
        } else {
          await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${todoistToken}` }, mode: 'cors' })
        }
      } catch {}
    }
    const entry = { id: Date.now(), date: new Date().toISOString().slice(0,10), title: (task.depth > 0? '└ ' : '') + task.content, source: 'todoist', completed_at: new Date().toISOString() }
    setLogs(prev => [entry,...prev]); setActive(prev => prev.filter(p => p.id!== task.id)); setPool(prev => prev.filter(p => p.id!== task.id && String(p.parent_id)!== String(task.id)))
  }

  function addCustom() { if (!custom.trim()) return; const nt = { id: `custom-${Date.now()}`, content: custom.trim(), priority: 2, depth: 0 }; if (active.length < 3) setActive(prev => [...prev, nt]); else setPool(prev => [nt,...prev]); setCustom('') }

  return (
    <div className={theme === 'dark'? 'dark' : ''}>
      <div className="min-h-screen bg-[#f8f8fb] dark:bg-[#0a0a0f] text-zinc-900 dark:text-zinc-100">
        <div className="max-w- mx-auto min-h-screen bg-white dark:bg-zinc-950 shadow-2xl flex flex-col">
          <div className="sticky top-0 z-20 backdrop-blur-xl bg-white/80 dark:bg-zinc-950/80 border-b px-5 flex justify-between" style={{ paddingTop: 'calc(12px + env(safe-area-inset-top))', paddingBottom: '12px' }}>
            <div className="pt-2"><div className="text- tracking-widest text-zinc-400">TODAY · 하위업무 포함</div><div className="font-semibold text-">{new Date().toLocaleDateString('ko-KR', { month:'long', day:'numeric' })} · {status}</div></div>
            <button onClick={() => setTheme(theme === 'dark'? 'light' : 'dark')} className="w-9 h-9 mt-2 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center translate-y-1">{theme==='dark'?'☀️':'🌙'}</button>
          </div>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd} onDragStart={e => setActiveId(e.active.id)}>
            <div className="flex-1 px-4 py-4 space-y-5">
              <details open className="text-xs border rounded-xl p-3 bg-zinc-50 dark:bg-zinc-900">
                <summary className="font-medium cursor-pointer">🔑 Todoist API · {status}</summary>
                <div className="mt-3 space-y-2">
                  <input value={todoistToken} onChange={e => { setTodoistToken(e.target.value); localStorage.setItem('todoist_token', e.target.value) }} placeholder="API token" className="w-full px-3 py-2.5 rounded-lg border bg-white dark:bg-zinc-950 text-xs" />
                  <input value={proxyUrl} onChange={e => { setProxyUrl(e.target.value); localStorage.setItem('todoist_proxy', e.target.value) }} placeholder="프록시 URL (선택) https://xxx.workers.dev" className="w-full px-3 py-2 rounded-lg border bg-white dark:bg-zinc-950 text-" />
                  <div className="flex gap-2"><button onClick={fetchToday} className="flex-1 py-2 rounded-lg bg-zinc-900 dark:bg-white text-white dark:text-black text-xs">오늘 + 하위업무 불러오기</button><button onClick={() => setShowSubtasks(!showSubtasks)} className="px-3 py-2 rounded-lg bg-zinc-200 dark:bg-zinc-800 text-xs">{showSubtasks? '하위 숨기기' : '하위 보기'}</button></div>
                  {error && <div className="p-2 rounded bg-red-50 text-red-600 text- break-all">{error}</div>}
                  <div className="text- text-zinc-400">예시 데이터 없음 · 실제 Todoist 데이터만 표시. 토큰은 기기에만 저장.</div>
                </div>
              </details>
              <div><h2 className="font-semibold mb-2">지금 하는 3개 ({active.length}/3)</h2>
                <SortableContext items={active.map(a=>a.id)} strategy={verticalListSortingStrategy}><div className="space-y-2 min-h- p-2 rounded-2xl border-2 border-dashed bg-zinc-50 dark:bg-zinc-900/50">{active.length===0 && <div className="text-center py-12 text-zinc-400 text-sm">오늘 일정 불러오면 여기에 3개가 채워져요</div>}{active.map((t,idx)=><div key={t.id} className="relative"><div className="absolute -left-1 -top-1 w-5 h-5 rounded-full bg-zinc-900 dark:bg-white text-white dark:text-black text- flex items-center justify-center font-bold z-10">{idx+1}</div><SortableItem task={t} isActive onComplete={completeTask} depth={t.depth} childCount={pool.filter(p=> String(p.parent_id)===String(t.id)).length} /></div>)}</div></SortableContext>
              </div>
              <div><div className="flex justify-between mb-2"><h2 className="font-semibold">오늘 풀 + 하위업무 ({filteredPool.length})</h2><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="검색" className="w-24 px-2 py-1 rounded-full bg-zinc-100 dark:bg-zinc-800 text-xs" /></div>
                <div id="pool-droppable" className="space-y-2 max-h- overflow-auto"><SortableContext items={filteredPool.map(a=>a.id)} strategy={verticalListSortingStrategy}>{filteredPool.map(t=>{ const childCount = pool.filter(p=> String(p.parent_id)===String(t.id)).length; return <SortableItem key={t.id} task={t} depth={t.depth} childCount={childCount} /> })}</SortableContext>{filteredPool.length===0 && <div className="text-center py-8 text-zinc-400 text-xs">오늘 할 일이 없거나 API키를 확인해보세요</div>}</div>
                <div className="mt-2 text- text-zinc-400">└ 가 하위업무, 들여쓰기로 구분. Pool 안에서도 위아래 드래그로 순서 변경 가능.</div>
              </div>
            </div>
            <DragOverlay>{activeId? <div className="p-3 rounded-xl bg-white shadow-xl border text-sm">{pool.find(p=>p.id===activeId)?.content || active.find(a=>a.id===activeId)?.content}</div> : null}</DragOverlay>
          </DndContext>
        </div>
      </div>
    </div>
  )
}
