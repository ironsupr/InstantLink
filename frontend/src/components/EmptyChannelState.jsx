import { HashIcon, MessageSquareIcon, SparklesIcon } from "lucide-react";

const EmptyChannelState = ({ isChannel, channelName, userName }) => {
  return (
    <div className="flex items-center justify-center h-full p-8">
      <div className="text-center max-w-md space-y-6">
        {isChannel ? (
          <>
            <div className="flex justify-center">
              <div className="bg-primary/10 p-6 rounded-3xl">
                <HashIcon className="size-16 text-primary" />
              </div>
            </div>
            <div>
              <h2 className="text-2xl font-bold mb-2">Welcome to #{channelName}!</h2>
              <p className="text-base-content/60">
                This is the beginning of the <span className="font-semibold">#{channelName}</span> channel. 
                Start a conversation by sending your first message below.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-3 text-left">
              <div className="bg-base-200 p-4 rounded-xl flex items-start gap-3">
                <SparklesIcon className="size-5 text-primary mt-1" />
                <div>
                  <h4 className="font-semibold mb-1">Channel Purpose</h4>
                  <p className="text-sm text-base-content/60">
                    Use this channel to collaborate with your team on {channelName}-related topics.
                  </p>
                </div>
              </div>
              <div className="bg-base-200 p-4 rounded-xl flex items-start gap-3">
                <MessageSquareIcon className="size-5 text-secondary mt-1" />
                <div>
                  <h4 className="font-semibold mb-1">Pro Tip</h4>
                  <p className="text-sm text-base-content/60">
                    Use threads to keep conversations organized and easy to follow.
                  </p>
                </div>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="flex justify-center">
              <div className="avatar">
                <div className="w-24 rounded-full ring ring-primary ring-offset-base-100 ring-offset-4">
                  <div className="bg-primary/10 flex items-center justify-center">
                    <MessageSquareIcon className="size-12 text-primary" />
                  </div>
                </div>
              </div>
            </div>
            <div>
              <h2 className="text-2xl font-bold mb-2">Start a Conversation</h2>
              <p className="text-base-content/60">
                This is the beginning of your direct message history with{" "}
                <span className="font-semibold">{userName || "your colleague"}</span>.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 justify-center">
              <span className="badge badge-primary badge-lg">👋 Say hello</span>
              <span className="badge badge-secondary badge-lg">💼 Collaborate</span>
              <span className="badge badge-accent badge-lg">🎯 Get things done</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default EmptyChannelState;
