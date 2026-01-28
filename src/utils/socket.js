// Socket.io client setup for real-time collaboration
import { io } from "socket.io-client";

const SOCKET_URL = "https://boardapp-backend.onrender.com";
let socketInstance = null;

/**
 * Get and clean authentication token
 * @returns {string|null} Clean token or null
 */
const getAuthToken = () => {
  const token = localStorage.getItem("whiteboard_user_token");
  if (!token) return null;
  
  // Remove "Bearer " prefix if it exists
  const cleaned = token.trim();
  if (cleaned.startsWith('Bearer ')) {
    return cleaned.substring(7).trim();
  }
  return cleaned;
};

/**
 * Force socket reconnection with fresh token
 * Used after login to ensure socket has the new token
 */
export const reconnectSocket = () => {
  if (socketInstance) {
    socketInstance.disconnect();
    socketInstance = null;
  }
};

/**
 * Get or create the socket connection with fresh authentication token
 * Reconnects if disconnected to ensure token is up-to-date
 * @param {boolean} forceReconnect - Force reconnection even if connected (for after login)
 * @returns {Object} Socket.io client instance
 */
const getSocket = (forceReconnect = false) => {
  const token = getAuthToken();
  
  // Force reconnection if requested (e.g., after login)
  if (forceReconnect && socketInstance) {
    socketInstance.disconnect();
    socketInstance = null;
  }
  
  // Create new socket if it doesn't exist
  if (!socketInstance) {
    socketInstance = io(SOCKET_URL, {
      extraHeaders: token ? { Authorization: `Bearer ${token}` } : {},
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
    });
  } 
  // Reconnect with fresh token if socket is disconnected
  else if (!socketInstance.connected) {
    socketInstance.disconnect();
    socketInstance = io(SOCKET_URL, {
      extraHeaders: token ? { Authorization: `Bearer ${token}` } : {},
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
    });
  }
  
  return socketInstance;
};

export default getSocket;
