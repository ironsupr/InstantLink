import { useState, useRef } from "react";
import { 
  PaperclipIcon, 
  ImageIcon, 
  SmileIcon, 
  SendIcon,
  XIcon,
  FileIcon,
} from "lucide-react";
import toast from "react-hot-toast";
import { uploadFile as uploadWorkspaceFile } from "../lib/api";

const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024;
const MAX_BACKEND_FALLBACK_SIZE = 7 * 1024 * 1024;

const fileToDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = (e) => resolve(e.target.result);
  reader.onerror = () => reject(new Error("Failed to read file"));
  reader.readAsDataURL(file);
});

const inferFileCategory = (mimeType = "") => {
  if (mimeType.startsWith("image/")) return "image";
  if (
    mimeType.includes("pdf") ||
    mimeType.includes("document") ||
    mimeType.includes("sheet") ||
    mimeType.includes("text") ||
    mimeType.includes("msword") ||
    mimeType.includes("officedocument")
  ) {
    return "document";
  }
  return "other";
};

const CustomMessageComposer = ({ channel, isChannel, channelOrUserId }) => {
  const [message, setMessage] = useState("");
  const [attachments, setAttachments] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [sending, setSending] = useState(false);
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);

  const uploadAttachment = async (att) => {
    try {
      const upload = await channel.sendFile(att.file);
      return upload?.file;
    } catch (streamError) {
      console.warn("Stream attachment upload failed, falling back to backend upload", streamError);
      if (att.size > MAX_BACKEND_FALLBACK_SIZE) {
        throw new Error(`${att.name} is too large for fallback upload. Please use a file under 7 MB.`);
      }
      const fileBase64 = await fileToDataUrl(att.file);
      const uploaded = await uploadWorkspaceFile({
        name: att.name,
        type: inferFileCategory(att.type),
        fileBase64,
        channel: channel?.id || channelOrUserId || "",
      });
      return uploaded?.url;
    }
  };

  const handleFileSelect = (files) => {
    const validFiles = Array.from(files).filter(file => {
      if (file.size > MAX_ATTACHMENT_SIZE) {
        toast.error(`${file.name} is too large (max 10MB)`);
        return false;
      }
      return true;
    });

    const newAttachments = validFiles.map(file => ({
      file,
      preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
      name: file.name,
      size: file.size,
      type: file.type,
    }));

    setAttachments(prev => [...prev, ...newAttachments]);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (e.dataTransfer.files.length > 0) {
      handleFileSelect(e.dataTransfer.files);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const removeAttachment = (index) => {
    setAttachments(prev => {
      const newAttachments = [...prev];
      if (newAttachments[index].preview) {
        URL.revokeObjectURL(newAttachments[index].preview);
      }
      newAttachments.splice(index, 1);
      return newAttachments;
    });
  };

  const handleSend = async () => {
    if (!message.trim() && attachments.length === 0) return;
    
    setSending(true);
    try {
      const messageData = {
        text: message.trim(),
      };

      if (attachments.length > 0) {
        messageData.attachments = await Promise.all(
          attachments.map(async (att) => {
            const assetUrl = await uploadAttachment(att);
            if (!assetUrl) throw new Error("Attachment upload failed");
            return {
              type: att.type.startsWith('image/') ? 'image' : 'file',
              asset_url: assetUrl,
              title: att.name,
              file_size: att.size,
              mime_type: att.type,
            };
          })
        );
      }

      await channel.sendMessage(messageData);
      
      // Clear form
      setMessage("");
      setAttachments([]);
      
      // Clear file previews
      attachments.forEach(att => {
        if (att.preview) URL.revokeObjectURL(att.preview);
      });
    } catch (error) {
      console.error("Error sending message:", error);
      toast.error(error?.response?.data?.message || error?.message || "Failed to send message");
    } finally {
      setSending(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <div className="border-t border-base-300 bg-base-100">
      {/* Attachment Previews */}
      {attachments.length > 0 && (
        <div className="px-6 pt-4 flex gap-3 overflow-x-auto">
          {attachments.map((att, index) => (
            <div key={index} className="relative flex-shrink-0">
              {att.preview ? (
                <div className="relative w-24 h-24 rounded-lg overflow-hidden border-2 border-base-300">
                  <img src={att.preview} alt={att.name} className="w-full h-full object-cover" />
                  <button
                    className="absolute top-1 right-1 btn btn-circle btn-xs bg-error/90 hover:bg-error border-none text-white"
                    onClick={() => removeAttachment(index)}
                  >
                    <XIcon className="size-3" />
                  </button>
                </div>
              ) : (
                <div className="relative w-48 p-3 rounded-lg border-2 border-base-300 bg-base-200">
                  <div className="flex items-start gap-2">
                    <FileIcon className="size-5 text-primary flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{att.name}</p>
                      <p className="text-xs text-base-content/50">{formatFileSize(att.size)}</p>
                    </div>
                    <button
                      className="btn btn-circle btn-xs bg-error/90 hover:bg-error border-none text-white flex-shrink-0"
                      onClick={() => removeAttachment(index)}
                    >
                      <XIcon className="size-3" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Drag and Drop Overlay */}
      {isDragging && (
        <div className="absolute inset-0 bg-primary/10 border-2 border-dashed border-primary flex items-center justify-center z-50">
          <div className="text-center">
            <PaperclipIcon className="size-12 text-primary mx-auto mb-2" />
            <p className="text-lg font-semibold text-primary">Drop files here</p>
          </div>
        </div>
      )}

      {/* Message Input */}
      <div 
        className="px-6 py-4 flex items-end gap-3"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => handleFileSelect(e.target.files)}
        />

        <button
          className="btn btn-ghost btn-circle btn-sm"
          onClick={() => fileInputRef.current?.click()}
          title="Attach file"
        >
          <PaperclipIcon className="size-5" />
        </button>

        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            className="textarea textarea-bordered w-full resize-none min-h-[44px] max-h-[120px] pr-12"
            placeholder={isChannel ? `Message #${channelOrUserId}...` : 'Type a message...'}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            rows={1}
            style={{
              height: 'auto',
              overflowY: message.split('\n').length > 3 ? 'auto' : 'hidden',
            }}
          />
          <button
            className="absolute right-3 bottom-3 btn btn-ghost btn-circle btn-xs"
            title="Add emoji"
          >
            <SmileIcon className="size-5" />
          </button>
        </div>

        <button
          className={`btn btn-primary btn-circle ${sending ? 'loading' : ''}`}
          onClick={handleSend}
          disabled={(!message.trim() && attachments.length === 0) || sending}
          title="Send message"
        >
          {!sending && <SendIcon className="size-5" />}
        </button>
      </div>
    </div>
  );
};

export default CustomMessageComposer;
