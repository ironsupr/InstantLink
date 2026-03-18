import { Loader2 } from "lucide-react";

function ChatLoader() {
  return (
    <div className="h-screen flex flex-col items-center justify-center p-4 bg-base-100 relative overflow-hidden">
      {/* Decorative blurred blobs */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-primary/10 rounded-full blur-[100px] pointer-events-none animate-pulse"></div>
      
      <div className="relative z-10 flex flex-col items-center">
        <div className="relative">
          <Loader2 className="animate-spin size-16 text-primary mb-6" strokeWidth={1.5} />
          <div className="absolute inset-0 bg-primary/20 blur-2xl rounded-full -z-10 animate-pulse"></div>
        </div>
        
        <h2 className="text-2xl font-bold text-base-content tracking-tight mb-2">
          Initializing Workspace
        </h2>
        <p className="text-base-content/50 font-medium animate-pulse">
          Setting up your collaborative environment...
        </p>
      </div>
    </div>
  );
}

export default ChatLoader;
