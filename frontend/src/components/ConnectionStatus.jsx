import { useEffect, useState } from "react";
import { WifiIcon, WifiOffIcon, LoaderIcon } from "lucide-react";

const ConnectionStatus = ({ chatClient }) => {
  const [status, setStatus] = useState("online"); // online, offline, reconnecting

  useEffect(() => {
    if (!chatClient) return;

    const handleConnectionChange = (event) => {
      if (event.online) {
        setStatus("online");
      }
    };

    const handleConnectionRecovered = () => {
      setStatus("online");
    };

    const handleConnectionError = () => {
      setStatus("offline");
    };

    chatClient.on("connection.changed", handleConnectionChange);
    chatClient.on("connection.recovered", handleConnectionRecovered);
    chatClient.on("connection.error", handleConnectionError);

    return () => {
      chatClient.off("connection.changed", handleConnectionChange);
      chatClient.off("connection.recovered", handleConnectionRecovered);
      chatClient.off("connection.error", handleConnectionError);
    };
  }, [chatClient]);

  if (status === "online") return null;

  return (
    <div 
      className={`fixed top-16 left-0 right-0 z-50 px-4 py-2 text-center text-sm font-semibold text-white animate-in slide-in-from-top duration-300 ${
        status === "offline" ? "bg-error" : "bg-warning"
      }`}
    >
      <div className="flex items-center justify-center gap-2">
        {status === "offline" ? (
          <>
            <WifiOffIcon className="size-4" />
            <span>You're offline. Messages will be sent when you reconnect.</span>
          </>
        ) : (
          <>
            <LoaderIcon className="size-4 animate-spin" />
            <span>Reconnecting...</span>
          </>
        )}
      </div>
    </div>
  );
};

export default ConnectionStatus;
