import { useState, useEffect } from "react";
import { SearchIcon, XIcon, CalendarIcon, UserIcon } from "lucide-react";
import Avatar from "./Avatar";

const MessageSearch = ({ channel, onClose, onMessageSelect }) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({
    from: "",
    date: "",
  });

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    const searchMessages = async () => {
      setLoading(true);
      try {
        // Search in channel messages
        const response = await channel.search({
          message: {
            text: { $autocomplete: query },
          },
        });
        
        setResults(response.results || []);
      } catch (error) {
        console.error("Search error:", error);
        setResults([]);
      } finally {
        setLoading(false);
      }
    };

    const debounce = setTimeout(searchMessages, 300);
    return () => clearTimeout(debounce);
  }, [query, channel]);

  const handleMessageClick = (message) => {
    if (onMessageSelect) {
      onMessageSelect(message);
    }
    onClose();
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return `Today at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } else if (date.toDateString() === yesterday.toDateString()) {
      return `Yesterday at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
    }
  };

  const highlightText = (text, query) => {
    if (!query) return text;
    const parts = text.split(new RegExp(`(${query})`, 'gi'));
    return parts.map((part, index) => 
      part.toLowerCase() === query.toLowerCase() ? 
        <mark key={index} className="bg-warning/30 text-warning-content font-semibold">{part}</mark> : 
        part
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center pt-20">
      <div className="bg-base-100 rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[600px] flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-base-300">
          <div className="flex items-center gap-3 mb-3">
            <div className="relative flex-1">
              <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 size-5 text-base-content/50" />
              <input
                type="text"
                placeholder="Search messages..."
                className="input input-bordered w-full pl-12 pr-12"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoFocus
              />
              {query && (
                <button
                  className="absolute right-4 top-1/2 -translate-y-1/2 btn btn-ghost btn-sm btn-circle"
                  onClick={() => setQuery("")}
                >
                  <XIcon className="size-4" />
                </button>
              )}
            </div>
            <button
              className="btn btn-ghost btn-circle"
              onClick={onClose}
            >
              <XIcon className="size-5" />
            </button>
          </div>

          {/* Filters */}
          <div className="flex gap-2">
            <button className="btn btn-sm gap-2">
              <UserIcon className="size-4" />
              From: Anyone
            </button>
            <button className="btn btn-sm gap-2">
              <CalendarIcon className="size-4" />
              Any time
            </button>
          </div>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="loading loading-spinner loading-lg text-primary"></div>
            </div>
          ) : results.length > 0 ? (
            <div className="space-y-2">
              <p className="text-sm text-base-content/60 mb-3">
                {results.length} result{results.length !== 1 ? 's' : ''}
              </p>
              {results.map((result) => (
                <button
                  key={result.message.id}
                  className="w-full text-left p-4 rounded-xl hover:bg-base-200 transition-colors border border-base-300"
                  onClick={() => handleMessageClick(result.message)}
                >
                  <div className="flex items-start gap-3">
                    <Avatar
                      src={result.message.user?.image}
                      name={result.message.user?.name}
                      size="w-10 h-10"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold">{result.message.user?.name}</span>
                        <span className="text-xs text-base-content/50">
                          {formatDate(result.message.created_at)}
                        </span>
                      </div>
                      <p className="text-sm line-clamp-2">
                        {highlightText(result.message.text, query)}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : query ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <SearchIcon className="size-12 text-base-content/30 mb-3" />
              <p className="text-base-content/60 font-medium">No messages found</p>
              <p className="text-sm text-base-content/40">Try different keywords</p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <SearchIcon className="size-12 text-base-content/30 mb-3" />
              <p className="text-base-content/60 font-medium">Search messages</p>
              <p className="text-sm text-base-content/40">Start typing to find messages</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MessageSearch;
