// API utility functions for canvas operations
import axios from "axios";

const API_BASE_URL = "https://boardapp-backend.onrender.com/api/canvas";

/**
 * Helper function to get and clean the authentication token from localStorage
 * @returns {string|null} Clean token without "Bearer " prefix, or null if not found
 */
const getAuthToken = () => {
  let token = localStorage.getItem('whiteboard_user_token');
  
  if (!token) {
    return null;
  }
  
  // Remove any whitespace
  token = token.trim();
  
  // Remove "Bearer " prefix if it exists (shouldn't happen, but just in case)
  if (token.startsWith('Bearer ')) {
    token = token.substring(7).trim();
  }
  
  return token;
};

/**
 * Update canvas elements in the database
 * @param {string} canvasId - The ID of the canvas to update
 * @param {Array} elements - Array of drawing elements to save
 * @returns {Promise<Object>} Response data from the server
 */
export const updateCanvas = async (canvasId, elements) => {
  try {
    const token = getAuthToken();
    
    if (!token) {
      console.error('No token available for updateCanvas');
      return;
    }
    
    const response = await axios.put(
      `${API_BASE_URL}/update`,
      { canvasId, elements },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }
    );
    
    console.log("Canvas updated successfully in the database!", response.data);
    return response.data;
  } catch (error) {
    // Silently fail - canvas updates happen frequently, don't spam console
    // console.error("Error updating canvas:", error);
  }
};

/**
 * Fetch initial canvas elements from the database
 * @param {string} canvasId - The ID of the canvas to load
 * @returns {Promise<Array>} Array of drawing elements
 */
export const fetchInitialCanvasElements = async (canvasId) => {
  try {
    const token = getAuthToken();
    
    if (!token) {
      console.error('No token available for fetchInitialCanvasElements');
      return;
    }
    
    const response = await axios.get(`${API_BASE_URL}/load/${canvasId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    
    return response.data.elements;
  } catch (error) {
    console.error("Error fetching initial canvas elements:", error);
  }
};
