import { useState, useRef, useEffect } from 'react';
import { useTasks } from '../../context/TaskContext';
import { sendMessage } from '../../services/gemini';

const AIChatSidebar = ({ onClose }) => {
  const { tasks } = useTasks();
  const [messages, setMessages] = useState([
    { role: 'model', parts: [{ text: "Hi! I'm your WorkSpace AI assistant 🚀 I can help you understand your tasks, manage your schedule, or answer any questions about your work. What can I help you with today?" }] }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;

    // Save user message immediately to the UI
    const newHistory = [...messages];
    setMessages([...newHistory, { role: 'user', parts: [{ text }] }]);
    setInput('');
    setLoading(true);

    try {
      // Pass previous history (exclude the very first greeting if you want, 
      // but passing it is fine too since role is 'model')
      // Note: we slice(1) to skip the hardcoded greeting from the actual API history to save tokens and avoid errors,
      // but Gemini allows multi-turn. For simplicity, we can pass the whole thing except the current user message
      // which is passed as the 3rd argument in our new service.
      const apiHistory = newHistory.slice(1).map(m => ({ 
        role: m.role, 
        parts: [...m.parts] 
      }));
      
      const reply = await sendMessage(apiHistory, tasks, text);
      
      setMessages(prev => [...prev, { role: 'model', parts: [{ text: reply }] }]);
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'model',
        parts: [{ text: `⚠️ ${err.message}` }]
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="fixed bottom-4 right-4 w-80 sm:w-96 bg-surface border border-border rounded-2xl shadow-card flex flex-col animate-slide-in z-50"
      style={{ height: '520px' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange to-orange-hover flex items-center justify-center text-white text-sm font-bold">
            AI
          </div>
          <div>
            <p className="text-sm font-bold text-text-primary">WorkSpace AI</p>
            <p className="text-xs text-green-400 font-medium">● Online</p>
          </div>
        </div>
        <button onClick={onClose} className="btn-ghost p-1.5 rounded-lg">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                msg.role === 'user'
                  ? 'bg-orange text-white rounded-tr-sm'
                  : 'bg-surfaceHover text-text-primary rounded-tl-sm'
              }`}
            >
              {msg.parts[0].text}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-surfaceHover px-4 py-3 rounded-2xl rounded-tl-sm flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-text-muted animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-text-muted animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-text-muted animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-border">
        <div className="flex items-end gap-2">
          <textarea
            className="input-field flex-1 resize-none rounded-xl"
            placeholder="Ask me anything about your tasks..."
            rows={1}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            style={{ maxHeight: '80px' }}
          />
          <button
            onClick={handleSend}
            disabled={loading || !input.trim()}
            className="w-9 h-9 rounded-xl bg-orange hover:bg-orange-hover flex items-center justify-center text-white transition-colors disabled:opacity-50 flex-shrink-0"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
        <p className="text-xs text-text-muted mt-1.5 text-center">Powered by AirBuddy AI</p>
      </div>
    </div>
  );
};

export default function AIAssistantButton() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* Floating Button */}
      {!isOpen && (
        <button
          id="ai-assistant-btn"
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 w-14 h-14 rounded-2xl bg-gradient-to-br from-orange to-orange-hover glow-orange text-white font-bold text-xl shadow-lg hover:scale-110 transition-transform duration-200 z-50 flex items-center justify-center"
          title="Open AI Assistant"
        >
          🤖
        </button>
      )}

      {/* Chat Sidebar */}
      {isOpen && <AIChatSidebar onClose={() => setIsOpen(false)} />}
    </>
  );
}
