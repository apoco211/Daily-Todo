
import { useState, useEffect } from 'react'
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragOverlay } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

// Mock Todoist data (실제로는 API)
const MOCK_TODOS = [
  { id: '1', content: 'DJ 앱 PWA 빌드 테스트', priority: 4, labels: [] },
  { id: '2', content: 'Supabase logs 테이블 생성', priority: 4, labels: [] },
  { id: '3', content: 'Todoist API 토큰 발급', priority: 3, labels: [] },
  { id: '4', content: '무한리필 UI 디테일 잡기', priority: 3, labels: [] },
  { id: '5', content: 'Vercel 배포 설정', priority: 2, labels: [] },
  { id: '6', content: '아이디어 인박스 정리', priority: 2, labels: [] },
  { id: '7', content: 'K+2 프로젝트 연동 확인', priority: 2, labels: [] },
  { id: '8', content: '드래그 UX 개선 (dnd-kit)', priority: 1, labels: [] },
]

const priorityColor = { 4: 'bg-red-500', 3: 'bg-orange-400', 2: 'bg-blue-500', 1: 'bg-gray-300' }
const priorityLabel = { 4: 'P1', 3: 'P2', 2: 'P3', 1: 'P4' }

function SortableItem({ task, isActive, onComplete }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}
      className={`group flex items-center gap-3 p-3 rounded-xl border bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 shadow-sm ${isActive ? 'ring-2 ring-zinc-900 dark:ring-white' : ''}`}>
      <div className={`w-2 h-2 rounded-full ${priorityColor[task.priority]}`} />
      <span className="flex-1 text-[14px] text-zinc-800 dark:text-zinc-100">{task.content}</span>
      <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500">{priorityLabel[task.priority]}</span>
      {isActive && (
        <button onClick={() => onComplete(task)} className="ml-1 w-7 h-7 rounded-full bg-zinc-900 dark:bg-white text-white dark:text-black flex items-center justify-center">✓</button>
      )}
    </div>
  )
}

export default function App() {
  const [theme, setTheme] = useState(localStorage.getItem('theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'))
  const [pool, setPool] = useState(MOCK_TODOS)
  const [active, setActive] = useState([MOCK_TODOS[0], MOCK_TODOS[1], MOCK_TODOS[2]].filter(Boolean))
  const [logs, setLogs] = useState(JSON.parse(localStorage.getItem('logs') || '[]'))
  const [custom, setCustom] = useState('')
  const [search, setSearch] = useState('')
  const [todoistToken, setTodoistToken] = useState(localStorage.getItem('todoist_token') || '')
  const [activeId, setActiveId] = useState(null)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    localStorage.setItem('theme', theme)
  }, [theme])
  useEffect(() => { localStorage.setItem('logs', JSON.stringify(logs)) }, [logs])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  const filteredPool = pool.filter(t => !active.find(a => a.id === t.id)).filter(t => t.content.includes(search))

  function handleDragEnd(event) {
    const { active: a, over } = event
    if (!over) return
    // Active 내부 정렬
    if (active.find(x => x.id === a.id) && active.find(x => x.id === over.id)) {
      setActive(items => {
        const oldIndex = items.findIndex(i => i.id === a.id)
        const newIndex = items.findIndex(i => i.id === over.id)
        return arrayMove(items, oldIndex, newIndex)
      })
      return
    }
    // Pool -> Active
    if (filteredPool.find(x => x.id === a.id) && active.length < 3) {
      const task = pool.find(p => p.id === a.id)
      if (task) setActive(prev => [...prev, task])
    }
    // Active -> Pool (드랍으로 제거)
    if (active.find(x => x.id === a.id) && over.id === 'pool-droppable') {
      setActive(prev => prev.filter(p => p.id !== a.id))
    }
  }

  async function completeTask(task) {
    // Todoist close API
    if (todoistToken && !task.id.startsWith('custom-')) {
      try {
        await fetch(`https://api.todoist.com/rest/v2/tasks/${task.id}/close`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${todoistToken}` }
        })
      } catch (e) { console.log('close failed, local only', e) }
    }
    const entry = { id: Date.now(), date: new Date().toISOString().slice(0, 10), title: task.content, source: task.id.startsWith('custom-') ? 'custom' : 'todoist', todoist_id: task.id, completed_at: new Date().toISOString() }
    setLogs(prev => [entry, ...prev])
    setActive(prev => prev.filter(p => p.id !== task.id))
    setPool(prev => prev.filter(p => p.id !== task.id))
  }

  function addCustom() {
    if (!custom.trim()) return
    const newTask = { id: `custom-${Date.now()}`, content: custom.trim(), priority: 2 }
    if (active.length < 3) setActive(prev => [...prev, newTask])
    else setPool(prev => [newTask, ...prev])
    setLogs(prev => [...prev]) // no log yet
    setCustom('')
    // 옵션: Todoist에도 생성
    if (todoistToken && document.getElementById('also-todoist')?.checked) {
      fetch('https://api.todoist.com/rest/v2/tasks', {
        method: 'POST',
        headers: { Authorization: `Bearer ${todoistToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newTask.content, due_string: 'today', priority: 2 })
      })
    }
  }

  return (
    <div className={theme === 'dark' ? 'dark' : ''}>
      <div className="min-h-screen bg-[#f8f8fb] dark:bg-[#0a0a0f] text-zinc-900 dark:text-zinc-100 transition-colors">
        <div className="max-w-[430px] mx-auto min-h-screen bg-white dark:bg-zinc-950 shadow-2xl relative flex flex-col">
          {/* Header */}
          <div className="sticky top-0 z-20 backdrop-blur-xl bg-white/80 dark:bg-zinc-950/80 border-b border-zinc-200 dark:border-zinc-800 px-5 py-4 flex items-center justify-between">
            <div>
              <div className="text-[11px] tracking-widest text-zinc-400">TODAY</div>
              <div className="font-semibold">{new Date().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })} · 완료 {logs.filter(l => l.date === new Date().toISOString().slice(0,10)).length}개</div>
            </div>
            <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="w-9 h-9 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">{theme === 'dark' ? '☀️' : '🌙'}</button>
          </div>

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd} onDragStart={e => setActiveId(e.active.id)}>
            <div className="flex-1 px-4 py-4 space-y-5">
              {/* Token */}
              <details className="text-xs">
                <summary className="cursor-pointer text-zinc-400">Todoist 토큰 설정</summary>
                <input value={todoistToken} onChange={e => { setTodoistToken(e.target.value); localStorage.setItem('todoist_token', e.target.value) }} placeholder="Todoist API token" className="mt-2 w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs" />
                <div className="mt-1 text-[10px] text-zinc-400">localStorage 저장, GET /rest/v2/tasks?filter=today 로 전체 로드 예정</div>
              </details>

              {/* Active 3 */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h2 className="font-semibold">지금 하는 3개 ({active.length}/3)</h2>
                  <span className="text-[11px] text-zinc-400">무한리필 큐 · 내부 드래그로 순서 변경</span>
                </div>
                <SortableContext items={active.map(a => a.id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-2 min-h-[160px] p-2 rounded-2xl border-2 border-dashed border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50">
                    {active.length === 0 && <div className="text-center py-12 text-zinc-400 text-sm">Pool에서 드래그해서 3개 채워보세요</div>}
                    {active.map((t, idx) => (
                      <div key={t.id} className="relative">
                        <div className="absolute -left-1 -top-1 w-5 h-5 rounded-full bg-zinc-900 dark:bg-white text-white dark:text-black text-[10px] flex items-center justify-center font-bold z-10">{idx + 1}</div>
                        <SortableItem task={t} isActive onComplete={completeTask} />
                      </div>
                    ))}
                  </div>
                </SortableContext>
              </div>

              {/* Pool */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h2 className="font-semibold">오늘 풀 (전체 {pool.length}개)</h2>
                  <input value={search} onChange={e => setSearch(e.target.value)} placeholder="검색" className="w-24 px-2 py-1 rounded-full bg-zinc-100 dark:bg-zinc-800 text-xs outline-none" />
                </div>
                <div id="pool-droppable" className="space-y-2 max-h-[320px] overflow-auto pr-1">
                  <SortableContext items={filteredPool.map(a => a.id)} strategy={verticalListSortingStrategy}>
                    {filteredPool.map(t => <SortableItem key={t.id} task={t} />)}
                  </SortableContext>
                </div>
              </div>

              {/* Custom */}
              <div className="p-3 rounded-2xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
                <div className="flex gap-2">
                  <input value={custom} onChange={e => setCustom(e.target.value)} onKeyDown={e => e.key === 'Enter' && addCustom()} placeholder="직접 추가 - 급한 일 바로 넣기" className="flex-1 px-3 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-sm outline-none" />
                  <button onClick={addCustom} className="px-4 py-2.5 rounded-xl bg-zinc-900 dark:bg-white text-white dark:text-black text-sm font-medium">추가</button>
                </div>
                <label className="mt-2 flex items-center gap-2 text-[11px] text-zinc-500"><input id="also-todoist" type="checkbox" /> Todoist에도 생성 (POST /tasks)</label>
              </div>

              {/* Logs */}
              <div>
                <h2 className="font-semibold mb-2">오늘 기록 · {logs.filter(l => l.date === new Date().toISOString().slice(0,10)).length}개 완료</h2>
                <div className="space-y-1.5 max-h-[200px] overflow-auto">
                  {logs.slice(0, 20).map(l => (
                    <div key={l.id} className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-900">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] ${l.source === 'todoist' ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'}`}>{l.source}</span>
                      <span className="flex-1 truncate">{l.title}</span>
                      <span className="text-zinc-400">{new Date(l.completed_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  ))}
                  {logs.length === 0 && <div className="text-xs text-zinc-400 text-center py-4">완료하면 여기에 타임라인 쌓여요</div>}
                </div>
              </div>
            </div>
            <DragOverlay>{activeId ? <div className="p-3 rounded-xl bg-white dark:bg-zinc-900 shadow-xl border text-sm">{pool.find(p => p.id === activeId)?.content || active.find(a => a.id === activeId)?.content}</div> : null}</DragOverlay>
          </DndContext>

          <div className="sticky bottom-0 border-t border-zinc-200 dark:border-zinc-800 bg-white/90 dark:bg-zinc-950/90 backdrop-blur p-3 flex gap-2">
            <button className="flex-1 py-3 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-sm">📅 기록 보기</button>
            <button onClick={() => { if(confirm('logs 초기화?')) { setLogs([]); localStorage.removeItem('logs') } }} className="px-4 py-3 rounded-xl bg-zinc-900 dark:bg-white text-white dark:text-black text-sm">초기화</button>
          </div>
        </div>
      </div>
    </div>
  )
}
