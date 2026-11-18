import { useState, useEffect, useMemo, useRef } from "react";
import { 
  DndContext, closestCenter, PointerSensor, TouchSensor, 
  useSensor, useSensors, useDroppable, DragOverlay 
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// ==========================================
// [설정] Supabase 및 프록시 기본 정보
// ==========================================
const SUPABASE_URL = "https://xykaixtheudykyvkrlel.supabase.co";
const SUPABASE_KEY = "sb_publishable_baIfSRe_JnHAIwwkLD31xA_RmUBWxyV";

const SUPABASE_HEADERS = {
  "apikey": SUPABASE_KEY,
  "Authorization": `Bearer ${SUPABASE_KEY}`,
  "Content-Type": "application/json",
  "Prefer": "return=minimal"
};

const PROXY = "https://todoist-proxy.apoco211.workers.dev";
const VERSION = "v1.22.3 (AI Meta-Sync)";

const HOLIDAYS_2026 = {
  "01-01":"신정","02-16":"설날","02-17":"설날","02-18":"설날",
  "03-01":"삼일절","03-02":"삼일절","05-05":"어린이날","05-24":"부처님오신날",
  "05-25":"부처님오신날","06-06":"현충일","08-15":"광복절","08-17":"광복절",
  "09-24":"추석","09-25":"추석","09-26":"추석","10-03":"개천절",
  "10-05":"개천절","10-09":"한글날","12-25":"크리스마스"
};

// 안전한 로컬스토리지 파싱 (배열 타입 손상 완벽 방어)
const safeParse = (key, defaultVal) => {
  try {
    const val = localStorage.getItem(key);
    if (!val || val === "undefined" || val === "null") return defaultVal;
    const parsed = JSON.parse(val);
    
    // 기본값이 배열인데, 파싱된 값이 배열이 아니면(데이터 오염) 기본값 반환
    if (Array.isArray(defaultVal) && !Array.isArray(parsed)) {
      return defaultVal;
    }
    return parsed !== null ? parsed : defaultVal;
  } catch (e) {
    return defaultVal;
  }
};

function getRootId(task, taskMap) {
  if(!task) return null;
  let cur = task;
  const v = new Set();
  while(cur?.parent_id && taskMap[cur.parent_id] && !v.has(cur.parent_id)) {
    v.add(cur.id);
    cur = taskMap[cur.parent_id];
  }
  return cur?.id || task.id;
}

// ==========================================
// [컴포넌트] 커스텀 모달 컴포넌트 (앱 멈춤 방지)
// ==========================================
function CustomModal({ isOpen, type, message, defaultValue, onConfirm, onCancel }) {
  const [inputValue, setInputValue] = useState(defaultValue || "");

  useEffect(() => {
    if (isOpen) setInputValue(defaultValue || "");
  }, [isOpen, defaultValue]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-5 max-w-sm w-full border dark:border-gray-700 animate-in fade-in zoom-in duration-200">
        <p className="text-gray-800 dark:text-gray-200 text-sm font-medium whitespace-pre-wrap break-words">{message}</p>
        
        {type === 'prompt' && (
          <input 
            autoFocus
            type="text" 
            value={inputValue} 
            onChange={(e) => setInputValue(e.target.value)} 
            onKeyDown={(e) => { if (e.key === 'Enter' && onConfirm) onConfirm(inputValue); }}
            className="w-full mt-3 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-blue-500 text-sm" 
          />
        )}
        
        <div className="flex justify-end gap-2 mt-5">
          {type === 'prompt' && (
            <button onClick={onCancel} className="px-4 py-1.5 rounded-lg text-sm bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-medium transition-colors">취소</button>
          )}
          <button onClick={() => { if(onConfirm) onConfirm(type === 'prompt' ? inputValue : undefined); }} className="px-4 py-1.5 rounded-lg text-sm bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors">확인</button>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// [컴포넌트] 개별 할 일 카드 UI
// ==========================================
function SortableItem({
  task, parentContent, isTop, isFocus, progress, isCandidate, hasChildren, expanded, 
  onToggle, onMoveTop, onMoveDown, onComplete, onDelete, 
  childrenList, descExpanded, onToggleDesc, onProgressChange,
  movingId, setMovingId, onMoveParentConfirm, validParents, onSetDeadline
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1, zIndex: isDragging ? 20 : 0 };
  
  let card = "rounded-lg px-2 py-1 flex flex-col gap-0.5 bg-white border border-gray-200 dark:bg-gray-800 dark:border-gray-600 relative overflow-hidden transition-colors";
  if (isTop) card = "rounded-lg px-2 py-1 flex flex-col gap-0.5 bg-blue-100 border border-blue-300 dark:bg-gray-800 dark:border-blue-500 relative overflow-hidden transition-colors";
  if (isFocus) card = "rounded-lg px-2 py-1 flex flex-col gap-0.5 bg-white border border-purple-300 shadow-sm relative overflow-hidden dark:bg-gray-800 dark:border-purple-500 transition-colors";
  if (isCandidate) card = "rounded-lg px-2 py-1 flex flex-col gap-0.5 bg-yellow-50 border border-yellow-200 dark:bg-gray-800 dark:border-yellow-600 relative overflow-hidden transition-colors";
  
  const hasDesc = !!(task?.description && task.description.trim().length > 0);

  return (
    <div ref={setNodeRef} style={style} className={card}>
      {isCandidate && <span className="absolute -top-1 -right-1 text-[7px] bg-amber-400 text-amber-900 px-1 py-0 rounded-full font-bold z-20">다음 후보</span>}
      
      {isFocus && (
        <div className="absolute top-0 left-0 h-full bg-purple-200/40 dark:bg-purple-900/40 pointer-events-none transition-all duration-300 z-0" style={{ width: `${progress || 0}%` }} />
      )}

      <div className="relative z-10 flex items-center gap-1">
        <button {...attributes} {...listeners} style={{ touchAction: 'none' }} className="w-5 h-5 flex items-center justify-center text-gray-400 dark:text-gray-300 cursor-grab text-[11px] touch-none select-none shrink-0">≡</button>
        
        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => { if(isFocus && onSetDeadline) { onSetDeadline(task.id, task.content); return; } if(hasDesc) onToggleDesc(task.id); }} onTouchStart={e => { if(hasDesc && !isFocus) e.stopPropagation(); }}>
          {parentContent && <div className="text-[8px] text-gray-500 dark:text-gray-400 leading-none truncate">{parentContent} ▸</div>}
          <div className="flex items-center gap-1">
            <div className="text-[11px] leading-[1.15] text-gray-900 dark:text-white truncate font-medium flex-