import { useState } from "react";
import { SmileIcon } from "lucide-react";

const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🎉", "🔥", "👏"];

const QuickReactions = ({ message, channel }) => {
  const [showPicker, setShowPicker] = useState(false);
  const [reacting, setReacting] = useState(false);

  const handleReaction = async (emoji) => {
    if (reacting) return;
    
    setReacting(true);
    try {
      await channel.sendReaction(message.id, { type: emoji });
      setShowPicker(false);
    } catch (error) {
      console.error("Error sending reaction:", error);
    } finally {
      setReacting(false);
    }
  };

  return (
    <div className="relative">
      <button
        className="btn btn-ghost btn-xs btn-circle"
        onClick={() => setShowPicker(!showPicker)}
        title="Add reaction"
      >
        <SmileIcon className="size-4" />
      </button>

      {showPicker && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setShowPicker(false)}
          />
          
          {/* Reactions Picker */}
          <div className="absolute bottom-full right-0 mb-2 z-50 bg-base-100 rounded-xl shadow-xl border border-base-300 p-2 flex gap-1 animate-in fade-in zoom-in duration-200">
            {QUICK_REACTIONS.map((emoji) => (
              <button
                key={emoji}
                className="btn btn-ghost btn-sm hover:scale-125 transition-transform duration-200"
                onClick={() => handleReaction(emoji)}
                disabled={reacting}
                title={`React with ${emoji}`}
              >
                <span className="text-xl">{emoji}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default QuickReactions;
