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
const VERSION = "v1.22.2 (AI Meta-Sync)";

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
            <div className="text-[11px] leading-[1.15] text-gray-900 dark:text-white truncate font-medium flex-1">{task?.content}</div>
            {hasDesc && <span className="text-[8px] text-gray-400 shrink-0">📝</span>}
          </div>
          {hasChildren && !isTop && !isFocus && !expanded && <div className="text-[8px] text-gray-500 dark:text-gray-400 leading-none">{(childrenList || []).length}개 하위</div>}
        </div>

        {isFocus && (
          <select 
            value={progress || 0} 
            onChange={e => onProgressChange(task.id, Number(e.target.value))} 
            onClick={e => e.stopPropagation()} 
            onTouchStart={e => e.stopPropagation()} 
            className="ml-1 text-[9px] bg-purple-50 dark:bg-gray-700 border border-purple-200 dark:border-gray-500 text-purple-700 dark:text-purple-300 rounded px-0.5 outline-none font-bold z-20"
          >
            {[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map(v => <option key={v} value={v}>{v}%</option>)}
          </select>
        )}

        <div className="flex items-center gap-0.5 shrink-0 z-20">
          {!isTop && !isFocus ? (
            <>
              {!task.parent_id && setMovingId && (
                <button onTouchStart={e=>e.stopPropagation()} onClick={()=>setMovingId(movingId === task.id ? null : task.id)} className="w-5 h-5 bg-green-500 text-white rounded text-[10px] font-bold">↳</button>
              )}
              <button onTouchStart={e=>e.stopPropagation()} onClick={()=>onComplete(task.id)} className="w-5 h-5 bg-black dark:bg-gray-300 text-white dark:text-black rounded text-[9px] font-bold">✓</button>
              <button onTouchStart={e=>e.stopPropagation()} onClick={()=>onMoveTop(task.id)} className="w-5 h-5 bg-blue-500 text-white rounded text-[9px] font-bold">▲</button>
              {hasChildren && <button onTouchStart={e=>e.stopPropagation()} onClick={()=>onToggle(task.id)} className="w-5 h-5 bg-gray-200 dark:bg-gray-600 dark:text-white rounded text-[8px]">{expanded ? '▲' : '▼'}</button>}
              <button onTouchStart={e=>e.stopPropagation()} onClick={()=>onDelete(task.id)} className="w-5 h-5 bg-gray-100 dark:bg-gray-700 dark:text-white rounded text-[8px]">✕</button>
            </>
          ) : (
            <>
              <button onTouchStart={e=>e.stopPropagation()} onClick={()=>onComplete(task.id)} className="w-5 h-5 bg-black dark:bg-gray-300 text-white dark:text-black rounded text-[9px] font-bold">✓</button>
              <button onTouchStart={e=>e.stopPropagation()} onClick={()=>onMoveDown(task.id)} className="w-5 h-5 bg-gray-100 dark:bg-gray-600 dark:text-white rounded text-[8px]">▼</button>
            </>
          )}
        </div>
      </div>

      {movingId === task.id && validParents && (
        <div className="relative z-30 mt-1 flex gap-1 items-center bg-green-50 dark:bg-green-900/30 p-1 rounded border border-green-200 dark:border-green-800">
          <select 
            onChange={e => onMoveParentConfirm(task.id, e.target.value)} 
            className="flex-1 text-[9px] p-1 rounded border dark:bg-gray-700 dark:text-white outline-none"
            defaultValue=""
          >
            <option value="" disabled>어디의 하위로 보낼까요?</option>
            {validParents?.map(p => <option key={p.id} value={p.id}>{p.content}</option>)}
          </select>
          <button onClick={() => setMovingId(null)} className="px-2 py-1 bg-gray-300 dark:bg-gray-600 text-[9px] rounded text-black dark:text-white">취소</button>
        </div>
      )}

      {hasDesc && descExpanded && (
        <div className="relative z-10 mt-1 ml-6 mr-0.5 p-1.5 rounded bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 select-text">
          <div className="text-[10px] text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-words select-text leading-[1.35]">{task.description}</div>
        </div>
      )}

      {!isTop && !isFocus && expanded && (childrenList || []).length > 0 && (
        <div className="relative z-10 ml-3 pl-2 border-l-2 border-gray-300 dark:border-gray-600 flex flex-col gap-0.5 mt-0.5">
          {childrenList.map(child => (
            <div key={child.id} className="flex items-center justify-between py-0.5 bg-gray-50 dark:bg-gray-900/50 rounded px-1">
              <div className="min-w-0 flex-1 cursor-pointer" onClick={() => { if(child.description) onToggleDesc(child.id); }}>
                <div className="text-[7px] text-gray-400 dark:text-gray-500 truncate">{task?.content} ▸</div>
                <div className="text-[10px] text-gray-800 dark:text-gray-200 truncate">{child?.content}</div>
              </div>
              <div className="flex gap-0.5 ml-1">
                <button onClick={()=>onComplete(child.id)} className="w-5 h-5 bg-black dark:bg-gray-300 text-white dark:text-black rounded text-[8px]">✓</button>
                <button onClick={()=>onMoveTop(child.id)} className="w-5 h-5 bg-blue-500 text-white rounded text-[8px]">▲</button>
              </div>
            </div>
          ))}
        </div>
      )}
      
      {(isTop || isFocus) && (childrenList || []).length > 0 && (
        <div className={`relative z-10 ml-2 pl-1.5 border-l-2 ${isFocus ? 'border-purple-300' : 'border-blue-300'} flex flex-col gap-0.5 mt-0.5`}>
          <div className={`text-[7px] ${isFocus ? 'text-purple-700 dark:text-purple-400' : 'text-blue-700 dark:text-blue-400'}`}>{childrenList.length}개 하위</div>
          {childrenList.map(ch => (
            <div key={ch.id} className="flex items-center justify-between bg-white/70 dark:bg-gray-800/70 rounded px-1 py-0">
              <span className="text-[9px] text-gray-800 dark:text-gray-200 truncate flex-1">• {ch?.content}</span>
              <button onClick={()=>onComplete(ch.id)} className="ml-1 w-4 h-4 bg-black dark:bg-gray-300 text-white dark:text-black rounded text-[7px]">✓</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TopDrop({ children, isOver }) {
  const { setNodeRef } = useDroppable({ id: "top-container" });
  return <div ref={setNodeRef} className={`rounded-lg border border-dashed p-1 min-h-[50px] transition-colors ${isOver ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-900/20' : 'border-gray-300 dark:border-gray-600'}`}>{children}</div>;
}

function FocusDrop({ children, isOver }) {
  const { setNodeRef } = useDroppable({ id: "focus-container" });
  return <div ref={setNodeRef} className={`rounded-lg border border-dashed p-1 min-h-[50px] transition-colors ${isOver ? 'border-purple-500 bg-purple-50/50 dark:bg-purple-900/20' : 'border-purple-300 dark:border-purple-700'}`}>{children}</div>;
}

// ==========================================
// [메인] 앱 컨트롤러
// ==========================================
export default function App() {
  const [isLoaded, setIsLoaded] = useState(false);
  const [tasks, setTasks] = useState([]);
  
  // 방어 코드: 로컬스토리지 데이터가 손상되어도 항상 배열 보장
  const [top3Ids, setTop3Ids] = useState(() => safeParse("top3Ids", []));
  const [poolOrder, setPoolOrder] = useState(() => safeParse("poolOrder", []));
  const [focusTasks, setFocusTasks] = useState([]); 
  
  const [logs, setLogs] = useState(() => safeParse("completed_logs", []));
  const [token, setToken] = useState(() => localStorage.getItem("todoist_token") || "");
  
  const [gcalClientId, setGcalClientId] = useState(() => localStorage.getItem("gcal_client_id") || "");
  const [gcalToken, setGcalToken] = useState(() => localStorage.getItem("gcal_token") || "");
  const [gcalEvents, setGcalEvents] = useState([]);

  const [activeTab, setActiveTab] = useState("today");
  const [expandedIds, setExpandedIds] = useState(new Set());
  const [descExpandedIds, setDescExpandedIds] = useState(new Set());
  const [dark, setDark] = useState(() => localStorage.getItem("dark") === "true");
  const [movingId, setMovingId] = useState(null); 
  
  const [birthYear, setBirthYear] = useState("");
  const [memoLifetime, setMemoLifetime] = useState("");
  const [memo10years, setMemo10years] = useState("");
  const [memoThisYear, setMemoThisYear] = useState("");

  const [newContent, setNewContent] = useState("");
  const [newPri, setNewPri] = useState(1);
  const [newParent, setNewParent] = useState("");
  
  const [showToken, setShowToken] = useState(false);
  const [tmpToken, setTmpToken] = useState(() => localStorage.getItem("todoist_token") || "");
  const [completedFromTodoist, setCompletedFromTodoist] = useState([]);
  
  const [activeId, setActiveId] = useState(null);
  const [isOverTop, setIsOverTop] = useState(false);
  const [isOverFocus, setIsOverFocus] = useState(false);

  const [modal, setModal] = useState({ isOpen: false, type: 'alert', message: '', onConfirm: null, onCancel: null });
  const showModal = (options) => setModal({ isOpen: true, type: options.type || 'alert', message: options.message, defaultValue: options.defaultValue, onConfirm: (val) => { setModal(p => ({ ...p, isOpen: false })); if(options.onConfirm) options.onConfirm(val); }, onCancel: () => { setModal(p => ({ ...p, isOpen: false })); if(options.onCancel) options.onCancel(); }});

  const [geminiKey, setGeminiKey] = useState(() => localStorage.getItem("gemini_api_key") || "");
  const [myThoughts, setMyThoughts] = useState(() => localStorage.getItem("my_thoughts") || "");
  const [showThoughts, setShowThoughts] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isAiProcessing, setIsAiProcessing] = useState(false);
  const [aiInsight, setAiInsight] = useState(() => localStorage.getItem("ai_insight") || "");
  
  const recognitionRef = useRef(null);

  // 음성 인식 초기화
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'ko-KR';

      recognition.onresult = (event) => {
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript + ' ';
          }
        }
        if (finalTranscript) {
          setMyThoughts(prev => {
            const updated = prev + (prev && !prev.endsWith(' ') ? ' ' : '') + finalTranscript;
            localStorage.setItem("my_thoughts", updated);
            return updated;
          });
        }
      };

      recognition.onerror = (event) => {
        console.warn("Speech error:", event.error);
        setIsRecording(false);
      };

      recognition.onend = () => {
        setIsRecording(false);
      };

      recognitionRef.current = recognition;
    }
  }, []);

  const toggleRecording = () => {
    if (!recognitionRef.current) {
      showModal({ message: "이 브라우저에서는 음성 인식을 지원하지 않습니다.\n(Chrome 또는 Safari 최신버전 권장)" });
      return;
    }
    if (isRecording) {
      recognitionRef.current.stop();
      setIsRecording(false);
    } else {
      try {
        recognitionRef.current.start();
        setIsRecording(true);
      } catch (e) {
        setIsRecording(false);
      }
    }
  };

  // AI 우선순위 자동 정렬 로직
  const handleAiSort = async () => {
    if (!geminiKey) {
      showModal({ message: "설정(⚙️)에서 Gemini API Key를 먼저 입력해주세요." });
      return;
    }
    if (!myThoughts.trim()) {
      showModal({ message: "AI가 맥락을 파악할 수 있도록 평소의 생각이나 고민을 먼저 기록해주세요." });
      return;
    }
    if (!poolTasks || poolTasks.length === 0) {
      showModal({ message: "정렬할 '오늘 풀'의 할 일이 없습니다." });
      return;
    }

    setIsAiProcessing(true);
    try {
      const promptText = `
        다음은 사용자의 최근 일상적인 생각과 고민들입니다.
        [사용자의 생각]:
        ${myThoughts}

        다음은 사용자가 오늘 해야 할 업무 목록(JSON)입니다.
        [할 일 목록]:
        ${JSON.stringify(poolTasks.map(t => ({ id: t.id, content: t.content })))}

        임무:
        1. 사용자의 생각을 심리학적으로 분석하여, 현재 가장 시급하거나 가치 있는 할 일의 우선순위를 재평가하세요.
        2. '오늘 풀'에 있는 할 일들의 ID 배열을 가장 중요한 순서대로 재정렬하여 반환하세요.
        3. 정렬의 이유가 되는 따뜻하고 객관적인 1줄 인사이트를 반환하세요.

        반드시 아래 JSON 스키마 구조로 응답해야 합니다. 다른 텍스트는 포함하지 마세요.
      `;

      const payload = {
        contents: [{ parts: [{ text: promptText }] }],
        generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
                type: "OBJECT",
                properties: {
                    insight: { type: "STRING" },
                    sortedIds: { type: "ARRAY", items: { type: "STRING" } }
                },
                required: ["insight", "sortedIds"]
            }
        }
      };

      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${geminiKey}`;
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || "API 통신 오류");
      }

      const textResult = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (textResult) {
        const parsed = JSON.parse(textResult);
        
        if (parsed.sortedIds && Array.isArray(parsed.sortedIds)) {
          const validSortedIds = parsed.sortedIds.filter(id => poolTasks.some(t => t.id === id));
          const missingIds = poolTasks.map(t => t.id).filter(id => !validSortedIds.includes(id));
          
          setPoolOrder([...validSortedIds, ...missingIds]);
        }
        
        if (parsed.insight) {
          setAiInsight(parsed.insight);
          localStorage.setItem("ai_insight", parsed.insight);
        }
      }
    } catch (error) {
      showModal({ message: `AI 정렬 중 오류가 발생했습니다.\n${error.message}` });
    } finally {
      setIsAiProcessing(false);
    }
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } })
  );

  const taskMap = useMemo(() => {
    const m = {};
    if (tasks && Array.isArray(tasks)) {
      tasks.forEach(t => m[t.id] = t);
    }
    return m;
  }, [tasks]);

  const dateInfo = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear(), m = now.getMonth() + 1, d = now.getDate();
    const dayIdx = now.getDay();
    const week = ["일", "월", "화", "수", "목", "금", "토"][dayIdx];
    const key = `${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const holiday = HOLIDAYS_2026[key];
    let weekColor = "text-gray-900 dark:text-white", labelColor = "text-blue-600", label = "";
    if (holiday) { weekColor = "text-red-600"; labelColor = "text-red-600"; label = `[${holiday}]`; }
    else if (dayIdx === 6) { weekColor = "text-blue-600 dark:text-blue-400"; label = "[주말]"; }
    else if (dayIdx === 0) { weekColor = "text-red-600 dark:text-red-400"; label = "[주말]"; }
    else { label = "[평일]"; }
    return { dateText: `${y}년 ${m}월${d}일`, weekText: `(${week})`, weekColor, label, labelColor };
  }, []);

  useEffect(() => {
    try {
      const hash = window.location.hash;
      if (hash && hash.includes("access_token")) {
        const params = new URLSearchParams(hash.substring(1));
        const gtoken = params.get("access_token");
        if (gtoken) {
          localStorage.setItem("gcal_token", gtoken);
          setGcalToken(gtoken);
          window.location.hash = "";
        }
      }
    } catch (e) {
      console.warn("Hash Parsing Error:", e);
    }
  }, []);

  useEffect(() => {
    if (!gcalToken) return;
    const fetchGcal = async () => {
      const start = new Date(); start.setHours(0,0,0,0);
      const end = new Date(); end.setHours(23,59,59,999);
      try {
        const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${start.toISOString()}&timeMax=${end.toISOString()}&singleEvents=true&orderBy=startTime`, {
          headers: { Authorization: `Bearer ${gcalToken}` }
        });
        if (res.status === 401) { 
          setGcalToken(""); localStorage.removeItem("gcal_token"); return;
        }
        const data = await res.json();
        setGcalEvents((data?.items || []).slice(0, 3));
      } catch (e) { console.warn("Google Calendar Fetch Error:", e); }
    }
    fetchGcal();
  }, [gcalToken]);

  const loginGoogle = () => {
    if (!gcalClientId) { showModal({ message: "구글 클라이언트 ID를 먼저 입력해주세요." }); return; }
    try {
      const redirect = window.location.origin + window.location.pathname;
      window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${gcalClientId}&redirect_uri=${encodeURIComponent(redirect)}&response_type=token&scope=https://www.googleapis.com/auth/calendar.readonly`;
    } catch (e) {
      showModal({ message: "로그인 리디렉션을 지원하지 않는 환경입니다." });
    }
  };

  const saveToSupabase = async (payload) => {
    if (!SUPABASE_URL || SUPABASE_URL === "YOUR_SUPABASE_URL") return;
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/daily_todo_settings?id=eq.1`, {
        method: "PATCH", headers: SUPABASE_HEADERS, body: JSON.stringify(payload)
      });
    } catch(e) { console.error("Supabase Save Error:", e); }
  };

  const fetchSupabaseSettings = async () => {
    if (!SUPABASE_URL || SUPABASE_URL === "YOUR_SUPABASE_URL") return;
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/daily_todo_settings?id=eq.1`, { headers: SUPABASE_HEADERS });
      const data = await res.json();
      if (data && Array.isArray(data) && data.length > 0) {
        const row = data[0];
        // 서버에서 받아온 데이터가 배열일 때만 덮어쓰기 (Script error 철벽 방어)
        if (Array.isArray(row.top3_ids)) setTop3Ids(row.top3_ids);
        if (Array.isArray(row.pool_order)) setPoolOrder(row.pool_order);
        if (Array.isArray(row.focus_tasks)) setFocusTasks(row.focus_tasks);
        
        if (row.birth_year) setBirthYear(row.birth_year);
        if (row.memo_lifetime) setMemoLifetime(row.memo_lifetime);
        if (row.memo_10years) setMemo10years(row.memo_10years);
        if (row.memo_this_year) setMemoThisYear(row.memo_this_year);
      }
    } catch(e) { console.error("Supabase Load Error:", e); }
  };

  useEffect(() => { fetchSupabaseSettings().then(() => setIsLoaded(true)); }, []);
  useEffect(() => { if (!isLoaded) return; localStorage.setItem("top3Ids", JSON.stringify(top3Ids || [])); saveToSupabase({ top3_ids: top3Ids || [] }); }, [top3Ids, isLoaded]);
  useEffect(() => { if (!isLoaded) return; localStorage.setItem("poolOrder", JSON.stringify(poolOrder || [])); saveToSupabase({ pool_order: poolOrder || [] }); }, [poolOrder, isLoaded]);
  useEffect(() => { if (!isLoaded) return; saveToSupabase({ focus_tasks: focusTasks || [] }); }, [focusTasks, isLoaded]);
  useEffect(() => { localStorage.setItem("completed_logs", JSON.stringify(logs || [])); }, [logs]);
  
  useEffect(() => {
    localStorage.setItem("dark", String(dark));
    if (dark) document.documentElement.classList.add("dark");
    else document.documentElement.classList.remove("dark");
  }, [dark]);

  const getChildren = (pid) => (tasks || []).filter(t => t.parent_id === pid);

  const fetchTasks = async (tok) => {
    const useToken = tok || tmpToken || token || localStorage.getItem("todoist_token") || "";
    if (!useToken) return;
    try {
      const res = await fetch(`${PROXY}/api/v1/tasks/filter?query=today%20|%20overdue`, { headers: { Authorization: `Bearer ${useToken}` } });
      if (!res.ok) return;
      const data = await res.json();
      const todays = data.results || data.tasks || data || [];
      const childResults = await Promise.all((todays || []).map(async t => {
        try {
          const r = await fetch(`${PROXY}/api/v1/tasks?parent_id=${t.id}`, { headers: { Authorization: `Bearer ${useToken}` } });
          const d = await r.json(); return d.results || d.tasks || (Array.isArray(d) ? d : []);
        } catch { return []; }
      }));
      const merged = {};
      [...(todays || []), ...childResults.flat()].forEach(t => { merged[t.id] = t; });
      let all = Object.values(merged);
      setTasks(all);
    } catch(e) { console.warn("불러오기 에러: " + e.message); }
  };

  const fetchCompleted = async () => {
    if (!token) return;
    try {
      const since = new Date(Date.now() - 7 * 86400000).toISOString();
      const res = await fetch(`${PROXY}/api/v1/completed/get_all?since=${encodeURIComponent(since)}&limit=100`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      setCompletedFromTodoist(data?.items || []);
    } catch {}
  };

  useEffect(() => { if (token) fetchTasks(token); }, [token]);
  useEffect(() => { if (activeTab === "history") fetchCompleted(); }, [activeTab]);

  const getTop3GroupCount = () => {
    const s = new Set();
    (top3Ids || []).forEach(id => { const t = taskMap[id]; if(t) s.add(getRootId(t, taskMap)); });
    return s.size;
  };
  
  const moveToTop = (id) => {
    const t = taskMap[id]; if (!t) return;
    const root = getRootId(t, taskMap);
    if (getTop3GroupCount() >= 3) { showModal({ message: "Top3 그룹은 최대 3개까지만 등록할 수 있습니다." }); return; }
    setTop3Ids(p => [...(p || []), id]);
    setFocusTasks(p => (p || []).filter(x => x.id !== id && x.id !== root));
    setPoolOrder(p => (p || []).filter(x => x !== id && x !== root));
  };
  
  const moveToFocus = (id) => {
    const t = taskMap[id]; if (!t) return;
    const root = getRootId(t, taskMap);
    if (focusTasks && focusTasks.length >= 5) { showModal({ message: "집중업무는 최대 5개까지만 등록할 수 있습니다." }); return; }
    if (!(focusTasks || []).find(f => f.id === id)) {
      setFocusTasks(p => [...(p || []), { id, progress: 10 }]);
      setTop3Ids(p => (p || []).filter(x => x !== id && x !== root));
      setPoolOrder(p => (p || []).filter(x => x !== id && x !== root));
    }
  };

  const moveDown = (id) => {
    setTop3Ids(p => (p || []).filter(x => x !== id));
    setPoolOrder(p => [id, ...(p || [])]);
  };
  
  const moveDownFromFocus = (id) => {
    setFocusTasks(p => (p || []).filter(x => x.id !== id));
    setPoolOrder(p => [id, ...(p || [])]);
  };

  const deleteLocal = (id) => {
    const toRemove = new Set([id]);
    (tasks || []).forEach(t => { if (t.parent_id === id) toRemove.add(t.id); });
    setTasks(p => (p || []).filter(t => !toRemove.has(t.id)));
    setTop3Ids(p => (p || []).filter(t => !toRemove.has(t)));
    setFocusTasks(p => (p || []).filter(t => !toRemove.has(t.id)));
    setPoolOrder(p => (p || []).filter(t => !toRemove.has(t)));
  };

  const completeTask = async (id) => {
    const t = taskMap[id]; if (!t) return;
    const children = getChildren(id);
    const toComplete = children.length ? [t, ...children] : [t];
    try {
      for (const c of toComplete) {
        await fetch(`${PROXY}/api/v1/tasks/${c.id}/close`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      }
    } catch(e) { console.warn(e); }
    const now = new Date();
    const dk = now.toISOString().slice(0, 10);
    setLogs(p => [...toComplete.map(x => ({ id: x.id, content: x.content, completedAt: now.toISOString(), dateKey: dk })), ...(p || [])]);
    const rem = new Set(toComplete.map(x => x.id));
    setTasks(p => (p || []).filter(x => !rem.has(x.id)));
    setTop3Ids(p => (p || []).filter(x => !rem.has(x)));
    setFocusTasks(p => (p || []).filter(x => !rem.has(x.id)));
    setPoolOrder(p => (p || []).filter(x => !rem.has(x)));
  };

  const moveTaskToParent = async (taskId, newParentId) => {
    const t = taskMap[taskId]; if (!t) return;
    setMovingId(null);
    const useToken = token || localStorage.getItem("todoist_token") || "";
    try {
      const body = { content: t.content, priority: t.priority || 1, parent_id: newParentId, due_string: "today", due_lang: "ko" };
      const res = await fetch(`${PROXY}/api/v1/tasks`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${useToken}` }, body: JSON.stringify(body) });
      const created = await res.json();
      await fetch(`${PROXY}/api/v1/tasks/${taskId}`, { method: "DELETE", headers: { Authorization: `Bearer ${useToken}` } });
      setTasks(p => [...(p || []).filter(x => x.id !== taskId), created]);
      setPoolOrder(p => (p || []).filter(x => x !== taskId));
    } catch(e) { showModal({ message: "이동 실패: " + e.message }); }
  };

  const setTaskDeadline = (id, oldContent) => {
    showModal({
      type: 'prompt',
      message: "기한을 입력하세요\n(예: 14:00, 퇴근 전, 자기 전)",
      onConfirm: async (input) => {
        if (!input || input.trim() === "") return;
        const newContent = `${oldContent} [${input.trim()}]`;
        setTasks(prev => (prev || []).map(t => t.id === id ? { ...t, content: newContent } : t));
        try {
          await fetch(`${PROXY}/api/v1/tasks/${id}`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ content: newContent })
          });
        } catch(e) { console.warn("기한 업데이트 에러", e); }
      }
    });
  };

  const addTask = async () => {
    if (!newContent.trim()) { showModal({ message: "할 일 내용을 입력해주세요." }); return; }
    const useToken = tmpToken || token || localStorage.getItem("todoist_token") || "";
    if (!useToken) { showModal({ message: "Todoist 토큰이 등록되지 않았습니다." }); return; }
    try {
      const body = { content: newContent, priority: newPri, due_string: "today", due_lang: "ko" };
      if (newParent) body.parent_id = newParent;
      const res = await fetch(`${PROXY}/api/v1/tasks`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${useToken}` }, body: JSON.stringify(body) });
      if (!res.ok) { const txt = await res.text(); showModal({ message: `추가 실패: ${txt}` }); return; }
      const created = await res.json();
      setTasks(p => [created, ...(p || [])]);
      setPoolOrder(p => [created.id, ...(p || [])]);
      setNewContent(""); setNewParent("");
      setTimeout(() => fetchTasks(useToken), 500);
    } catch(e) { showModal({ message: "추가 에러: " + e.message }); }
  };

  const topRoots = useMemo(() => {
    const s = new Set(); (top3Ids || []).forEach(id => { const t = taskMap[id]; if(t) s.add(getRootId(t, taskMap)); }); return s;
  }, [top3Ids, taskMap]);

  const focusRoots = useMemo(() => {
    const s = new Set(); (focusTasks || []).forEach(f => { const t = taskMap[f.id]; if(t) s.add(getRootId(t, taskMap)); }); return s;
  }, [focusTasks, taskMap]);

  const poolTasks = useMemo(() => {
    let filtered = (tasks || []).filter(t => {
      const root = getRootId(t, taskMap);
      if (topRoots.has(root) || focusRoots.has(root)) return false;
      if (t.parent_id && taskMap[t.parent_id]) return false;
      return true;
    });
    // poolOrder 배열 타입 안전 확인
    if (poolOrder && Array.isArray(poolOrder) && poolOrder.length > 0) {
      const orderMap = new Map(poolOrder.map((id, idx) => [id, idx]));
      filtered = [...filtered].sort((a, b) => {
        const aIdx = orderMap.has(a.id) ? orderMap.get(a.id) : 9999;
        const bIdx = orderMap.has(b.id) ? orderMap.get(b.id) : 9999;
        return aIdx - bIdx;
      });
    }
    return filtered;
  }, [tasks, topRoots, focusRoots, taskMap, poolOrder]);

  const validParentsForMove = useMemo(() => (tasks || []).filter(t => !t.parent_id), [tasks]);

  const groupedLogs = useMemo(() => {
    const all = [...(logs || [])];
    (completedFromTodoist || []).forEach(c => {
      const dk = (c?.completed_at || "").slice(0, 10);
      if (dk) all.push({ id: c.task_id || c.id, content: c.content, completedAt: c.completed_at, dateKey: dk });
    });
    const map = new Map();
    all.forEach(l => { const k = l.id + "_" + l.dateKey; if(!map.has(k)) map.set(k, l); });
    const arr = Array.from(map.values()).sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));
    const grouped = {};
    arr.forEach(l => { if (!grouped[l.dateKey]) grouped[l.dateKey] = []; grouped[l.dateKey].push(l); });
    return Object.entries(grouped).sort((a, b) => b[0].localeCompare(a[0]));
  }, [logs, completedFromTodoist]);

  return (
    <div className={`min-h-screen bg-gray-50 dark:bg-gray-950 flex justify-center ${dark ? 'dark' : ''}`}>
      <CustomModal {...modal} />
      <div className="w-full max-w-[430px] bg-white dark:bg-gray-900 min-h-screen shadow-xl flex flex-col transition-colors" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        
        {/* 헤더 */}
        <header className="flex justify-between items-center px-2 py-1 border-b dark:border-gray-800 bg-white dark:bg-gray-900 z-10 transition-colors">
          <div className="text-[10px] font-bold text-gray-400 shrink-0">{VERSION}</div>
          <div className="flex-1 text-center text-[12px] font-bold">
            <span className="text-gray-900 dark:text-white">{dateInfo.dateText} </span>
            <span className={dateInfo.weekColor}>{dateInfo.weekText}</span>
            <span className={`${dateInfo.labelColor} text-[9px] ml-1`}>{dateInfo.label}</span>
          </div>
          <div className="flex gap-0.5 shrink-0">
            <button onClick={() => setShowToken(!showToken)} className="w-5 h-5 rounded-full bg-gray-100 dark:bg-gray-800 text-[9px] transition-colors">⚙️</button>
            <button onClick={() => setDark(!dark)} className="w-5 h-5 rounded-full bg-gray-100 dark:bg-gray-800 text-[9px] transition-colors">{dark ? '☀️' : '🌙'}</button>
          </div>
        </header>

        {showToken && (
          <div className="p-2 bg-gray-50 dark:bg-gray-800 border-b flex flex-col gap-2 transition-colors">
            <div className="text-[9px] text-gray-500 font-bold ml-1">연동 설정</div>
            <div className="flex gap-1">
              <input type="password" value={tmpToken} onChange={e=>setTmpToken(e.target.value)} placeholder="Todoist API 토큰" className="flex-1 px-2 py-1 rounded border text-[10px] dark:border-gray-600 dark:bg-gray-700 dark:text-white outline-none focus:border-blue-500"/>
              <button onClick={()=>{localStorage.setItem("todoist_token", tmpToken); setToken(tmpToken); setTimeout(()=>fetchTasks(tmpToken),300);}} className="bg-black text-white px-2 py-1 rounded text-[10px] font-medium">저장</button>
            </div>
            <div className="flex gap-1">
              <input type="text" value={gcalClientId} onChange={e=>setGcalClientId(e.target.value)} onBlur={()=>localStorage.setItem("gcal_client_id", gcalClientId)} placeholder="Google Client ID (캘린더용)" className="flex-1 px-2 py-1 rounded border text-[10px] dark:border-gray-600 dark:bg-gray-700 dark:text-white outline-none focus:border-blue-500"/>
              <button onClick={loginGoogle} className="bg-blue-600 text-white px-2 py-1 rounded text-[10px] font-medium">구글로그인</button>
            </div>
            <div className="flex gap-1 mt-1 border-t dark:border-gray-700 pt-2">
              <input type="password" value={geminiKey} onChange={e=>setGeminiKey(e.target.value)} placeholder="Gemini API Key (AI용)" className="flex-1 px-2 py-1 rounded border text-[10px] dark:border-gray-600 dark:bg-gray-700 dark:text-white outline-none focus:border-purple-500"/>
              <button onClick={()=>{localStorage.setItem("gemini_api_key", geminiKey); setShowToken(false);}} className="bg-purple-600 text-white px-2 py-1 rounded text-[10px] font-medium">저장</button>
            </div>
          </div>
        )}

        {/* 탭 메뉴 */}
        <div className="flex border-b border-gray-200 dark:border-gray-800 transition-colors">
          {["today", "longTerm", "history"].map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)} className={`flex-1 py-1.5 text-[10px] transition-colors ${activeTab === tab ? 'border-b-2 border-black dark:border-white font-bold text-black dark:text-white' : 'text-gray-500 dark:text-gray-400'}`}>
              {tab === "today" ? "오늘 할 일" : tab === "longTerm" ? "중장기계획" : "히스토리"}
            </button>
          ))}
        </div>

        {/* 오늘 할 일 탭 */}
        {activeTab === "today" && (
          <div className="flex-1 overflow-auto p-1 flex flex-col gap-1.5 pb-10">
            
            {/* AI 생각/고민 일기장 패널 */}
            <div className="mx-1 mt-0.5 bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-gray-800 dark:to-indigo-900/30 rounded-lg shadow-sm border border-indigo-100 dark:border-indigo-800 transition-colors">
              <div 
                className="px-2 py-1.5 flex justify-between items-center cursor-pointer select-none"
                onClick={() => setShowThoughts(!showThoughts)}
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px]">🧠</span>
                  <span className="text-[10px] font-bold text-indigo-900 dark:text-indigo-200">생각과 고민 (메타인지)</span>
                  {myThoughts.trim() && !showThoughts && <span className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-pulse"></span>}
                </div>
                <span className="text-indigo-500 dark:text-indigo-400 text-[10px]">{showThoughts ? '▲' : '▼'}</span>
              </div>
              
              {showThoughts && (
                <div className="px-2 pb-2 flex flex-col gap-1.5 animate-in slide-in-from-top-2 fade-in duration-200">
                  <textarea 
                    value={myThoughts} 
                    onChange={e => {
                      setMyThoughts(e.target.value);
                      localStorage.setItem("my_thoughts", e.target.value);
                    }}
                    placeholder="요즘 어떤 생각을 하고 있나요? 업무를 보며 떠오른 생각, 부담되는 점을 음성이나 글로 자유롭게 남겨주세요." 
                    className="w-full text-[10px] p-2 bg-white/70 dark:bg-gray-900/70 border border-indigo-200 dark:border-indigo-700/50 rounded resize-none h-20 outline-none focus:border-indigo-400 dark:text-white transition-colors"
                  />
                  <div className="flex gap-1 justify-between items-center">
                    <button 
                      onClick={toggleRecording} 
                      className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold transition-colors ${isRecording ? 'bg-red-100 text-red-600 border border-red-200 animate-pulse' : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-600'}`}
                    >
                      {isRecording ? '🔴 듣고 있어요...' : '🎤 음성으로 기록'}
                    </button>
                    <button 
                      onClick={handleAiSort}
                      disabled={isAiProcessing}
                      className={`flex items-center gap-1 px-3 py-1 rounded text-[10px] font-bold text-white transition-colors ${isAiProcessing ? 'bg-indigo-300' : 'bg-indigo-600 hover:bg-indigo-700 shadow-sm'}`}
                    >
                      {isAiProcessing ? '⏳ AI 분석 중...' : '✨ AI 우선순위 재정렬'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* AI 피드백 뷰 */}
            {aiInsight && (
              <div className="mx-1 mt-0.5 bg-yellow-50 dark:bg-amber-900/20 border border-yellow-200 dark:border-amber-700 rounded p-1.5 animate-in fade-in duration-300">
                <div className="text-[10px] font-medium text-amber-900 dark:text-amber-200 flex gap-1 items-start">
                  <span>💡</span>
                  <span className="leading-snug">{aiInsight}</span>
                </div>
              </div>
            )}

            {/* 구글 캘린더 위젯 */}
            {gcalToken && gcalEvents && gcalEvents.length > 0 && (
              <div className="mx-1 mt-0.5 bg-blue-50 dark:bg-blue-900/20 rounded shadow-sm border border-blue-100 dark:border-blue-800 p-1.5 cursor-pointer transition-colors" onClick={() => window.open('https://calendar.google.com/calendar/r/day', '_blank')}>
                <div className="text-[10px] font-bold text-blue-700 dark:text-blue-400 mb-0.5 flex items-center gap-1">📅 오늘의 구글 일정</div>
                {gcalEvents.map(ev => {
                  const time = ev?.start?.dateTime ? new Date(ev.start.dateTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '종일';
                  return (
                    <div key={ev?.id} className="text-[9px] text-gray-800 dark:text-gray-200 truncate flex items-center gap-1">
                      <span className="w-1 h-1 rounded-full bg-blue-500 shrink-0"></span>
                      <span className="font-bold">{time}</span> - {ev?.summary || "일정 없음"}
                    </div>
                  );
                })}
              </div>
            )}

            {/* 할 일 입력창 */}
            <div className="flex gap-0.5 mt-1 px-1">
              <input value={newContent} onChange={e=>setNewContent(e.target.value)} onKeyDown={e=>{if(e.key==='Enter') addTask();}} placeholder="추가업무 (엔터)" className="flex-1 px-2 py-1 rounded border dark:border-gray-700 dark:bg-gray-800 dark:text-white bg-blue-50/50 text-[10px] outline-none transition-colors"/>
              <select value={newPri} onChange={e=>setNewPri(Number(e.target.value))} className="px-1 rounded border dark:border-gray-700 dark:bg-gray-800 dark:text-white text-[9px] outline-none">
                <option value={1}>P4</option><option value={2}>P3</option><option value={3}>P2</option><option value={4}>P1</option>
              </select>
              <select value={newParent} onChange={e=>setNewParent(e.target.value)} className="px-1 rounded border dark:border-gray-700 dark:bg-gray-800 dark:text-white text-[9px] max-w-[60px] outline-none">
                <option value="">부모없음</option>
                {validParentsForMove.map(t=><option key={t.id} value={t.id}>{(t.content || "").slice(0,10)}</option>)}
              </select>
              <button onClick={addTask} className="bg-blue-500 text-white px-2 rounded text-[11px] hover:bg-blue-600 transition-colors">+</button>
            </div>
            
            {/* 드래그 앤 드롭 영역 */}
            <DndContext sensors={sensors} collisionDetection={closestCenter} 
              onDragStart={e => setActiveId(e.active.id)} 
              onDragOver={e => {
                setIsOverTop(e.over?.id === "top-container");
                setIsOverFocus(e.over?.id === "focus-container");
              }} 
              onDragEnd={e => {
                const { active, over } = e;
                setActiveId(null); setIsOverTop(false); setIsOverFocus(false);
                if (!over) return;
                
                if (over.id === "top-container") { moveToTop(active.id); return; }
                if (over.id === "focus-container") { moveToFocus(active.id); return; }

                if ((focusTasks || []).find(f => f.id === active.id) && (focusTasks || []).find(f => f.id === over.id)) {
                  setFocusTasks(prev => arrayMove(prev || [], (prev || []).findIndex(x => x.id === active.id), (prev || []).findIndex(x => x.id === over.id)));
                  return;
                }
                
                if ((top3Ids || []).includes(active.id) && (top3Ids || []).includes(over.id)) {
                  setTop3Ids(prev => arrayMove(prev || [], (prev || []).indexOf(active.id), (prev || []).indexOf(over.id)));
                  return;
                }

                const aIdx = poolTasks.findIndex(t => t.id === active.id);
                const oIdx = poolTasks.findIndex(t => t.id === over.id);
                if (aIdx !== -1 && oIdx !== -1) {
                  const newPool = arrayMove(poolTasks, aIdx, oIdx);
                  if (newPool.length > 0) setPoolOrder(newPool.map(t => t.id));
                }
              }}
            >
              <div className="flex flex-col gap-0.5 px-1">
                <div className="text-[10px] font-bold text-purple-700 dark:text-purple-400 mt-1">🔥 집중업무 ({(focusTasks || []).length}/5)</div>
                <FocusDrop isOver={isOverFocus}>
                  <SortableContext items={(focusTasks || []).map(f=>f.id)} strategy={verticalListSortingStrategy}>
                    <div className="flex flex-col gap-0.5">
                      {(!focusTasks || focusTasks.length === 0) ? <div className="text-center text-gray-400 text-[10px] py-2">드래그해서 추가</div> : 
                        focusTasks.map(f => {
                          const t = taskMap[f.id]; if(!t) return null;
                          return <SortableItem key={f.id} task={t} isFocus={true} progress={f.progress} onProgressChange={(tid, p) => setFocusTasks(prev => (prev || []).map(x => x.id === tid ? { ...x, progress: p } : x))} hasChildren={getChildren(f.id).length > 0} childrenList={getChildren(f.id)} onComplete={completeTask} onMoveDown={() => moveDownFromFocus(f.id)} descExpanded={descExpandedIds.has(t.id)} onToggleDesc={tid => setDescExpandedIds(s => { const n = new Set(s); n.has(tid) ? n.delete(tid) : n.add(tid); return n; })} onSetDeadline={setTaskDeadline} />
                        })
                      }
                    </div>
                  </SortableContext>
                </FocusDrop>
              </div>

              <div className="flex flex-col gap-0.5 mt-1 px-1">
                <div className="text-[10px] font-bold dark:text-gray-200">🎯 Top3 ({getTop3GroupCount()}/3)</div>
                <TopDrop isOver={isOverTop}>
                  <SortableContext items={top3Ids || []} strategy={verticalListSortingStrategy}>
                    <div className="flex flex-col gap-0.5">
                      {(!top3Ids || top3Ids.length === 0) ? <div className="text-center text-gray-400 text-[10px] py-2">▲로 올리기</div> : 
                        top3Ids.map(id => {
                          const t = taskMap[id]; if(!t) return null;
                          const pn = t.parent_id && taskMap[t.parent_id] ? taskMap[t.parent_id].content : undefined;
                          return <SortableItem key={id} task={t} parentContent={pn} isTop={true} hasChildren={getChildren(id).length > 0} childrenList={getChildren(id)} onComplete={completeTask} onMoveDown={moveDown} descExpanded={descExpandedIds.has(t.id)} onToggleDesc={tid => setDescExpandedIds(s => { const n = new Set(s); n.has(tid) ? n.delete(tid) : n.add(tid); return n; })} />
                        })
                      }
                    </div>
                  </SortableContext>
                </TopDrop>
              </div>
              
              <div className="flex flex-col gap-0.5 mt-1 px-1">
                <div className="text-[10px] font-bold dark:text-gray-200">📋 오늘 풀 ({poolTasks.length})</div>
                <SortableContext items={poolTasks.map(t=>t.id)} strategy={verticalListSortingStrategy}>
                  <div className="flex flex-col gap-0.5">
                    {poolTasks.map((t, idx) => {
                      const children = getChildren(t.id);
                      return <SortableItem key={t.id} task={t} isCandidate={idx < 3} hasChildren={children.length > 0} expanded={expandedIds.has(t.id)} childrenList={children} onToggle={pid => setExpandedIds(s => { const n = new Set(s); n.has(pid) ? n.delete(pid) : n.add(pid); return n; })} onMoveTop={moveToTop} onDelete={deleteLocal} onComplete={completeTask} descExpanded={descExpandedIds.has(t.id)} onToggleDesc={tid => setDescExpandedIds(s => { const n = new Set(s); n.has(tid) ? n.delete(tid) : n.add(tid); return n; })} movingId={movingId} setMovingId={setMovingId} onMoveParentConfirm={moveTaskToParent} validParents={validParentsForMove.filter(p => p.id !== t.id)} />
                    })}
                  </div>
                </SortableContext>
              </div>
              <DragOverlay>{activeId ? <div className="rounded p-1.5 bg-white dark:bg-gray-800 border border-blue-500 shadow text-[10px] dark:text-white">{taskMap[activeId]?.content}</div> : null}</DragOverlay>
            </DndContext>
          </div>
        )}

        {/* 중장기계획 탭 */}
        {activeTab === "longTerm" && (
          <div className="flex-1 overflow-auto p-2 flex flex-col gap-4 bg-gray-50 dark:bg-gray-950 transition-colors">
            <div className="bg-white dark:bg-gray-800 p-3 rounded-lg shadow-sm border dark:border-gray-700 text-[11px] font-bold flex items-center justify-between transition-colors">
              <span className="text-gray-700 dark:text-gray-200">태어난 해를 입력하세요</span>
              <div className="flex items-center gap-1">
                <input type="number" value={birthYear} onChange={e=>setBirthYear(e.target.value)} onBlur={()=>saveToSupabase({birth_year: birthYear})} className="border border-gray-300 dark:border-gray-600 bg-transparent rounded px-2 py-1 w-20 text-center font-bold dark:text-white outline-none focus:border-gray-500" placeholder="예: 1980" />
                <span className="dark:text-gray-200">년</span>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="font-bold text-[12px] text-purple-700 dark:text-purple-400 flex items-center gap-1">💎 평생 이룰 것</div>
              <textarea value={memoLifetime} onChange={e=>setMemoLifetime(e.target.value)} onBlur={()=>saveToSupabase({memo_lifetime: memoLifetime})} className="w-full border border-gray-300 dark:border-gray-700 dark:bg-gray-900 dark:text-white rounded-lg p-2 text-[12px] h-28 resize-none shadow-sm outline-none focus:border-purple-400 transition-colors" placeholder="평생에 걸쳐 이루고 싶은 궁극적인 목표를 적어보세요." />
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="font-bold text-[12px] text-blue-700 dark:text-blue-400 flex items-center gap-1">🚀 10년 안에 이룰 것 {birthYear ? `(~${new Date().getFullYear() + 10 - Number(birthYear)}세)` : ''}</div>
              <textarea value={memo10years} onChange={e=>setMemo10years(e.target.value)} onBlur={()=>saveToSupabase({memo_10years: memo10years})} className="w-full border border-gray-300 dark:border-gray-700 dark:bg-gray-900 dark:text-white rounded-lg p-2 text-[12px] h-28 resize-none shadow-sm outline-none focus:border-blue-400 transition-colors" placeholder="앞으로 10년, 무엇을 성취하고 싶나요?" />
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="font-bold text-[12px] text-green-700 dark:text-green-400 flex items-center gap-1">🔥 금년에 이룰 것</div>
              <textarea value={memoThisYear} onChange={e=>setMemoThisYear(e.target.value)} onBlur={()=>saveToSupabase({memo_this_year: memoThisYear})} className="w-full border border-gray-300 dark:border-gray-700 dark:bg-gray-900 dark:text-white rounded-lg p-2 text-[12px] h-28 resize-none shadow-sm outline-none focus:border-green-400 transition-colors" placeholder="올해 반드시 해낼 일들을 적어보세요." />
            </div>
          </div>
        )}

        {/* 히스토리 탭 */}
        {activeTab === "history" && (
          <div className="flex-1 overflow-auto p-1 transition-colors">
            {groupedLogs.map(([date, items]) => (
              <div key={date} className="border dark:border-gray-700 rounded p-1 bg-gray-50 dark:bg-gray-800 mb-1 transition-colors">
                <div className="font-bold text-[9px] mb-0.5 dark:text-gray-300">{date} ({items.length})</div>
                <div className="flex flex-col gap-0.5">
                  {items.map(it => (
                    <div key={it.id + "_" + it.completedAt} className="text-[10px] bg-white dark:bg-gray-700 dark:text-gray-200 rounded px-1 py-0.5 border dark:border-gray-600 truncate transition-colors">{it?.content}</div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}