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
  const [logs, setLogs] = useState(JSON.parse(localStorage.getItem('logs') || '
