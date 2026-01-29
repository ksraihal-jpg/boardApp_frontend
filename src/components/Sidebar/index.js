import React, { useState, useEffect, useContext } from 'react';
import axios from 'axios';
import { useNavigate, useParams } from 'react-router-dom';

// Context and styles
import boardContext from '../../store/board-context';
import './index.min.css';

// API base URL
const API_BASE_URL = 'https://boardapp-backend.onrender.com/api/canvas';

/**
 * Sidebar Component - Canvas management and user controls
 * Handles canvas list, creation, deletion, sharing, and authentication
 */
const Sidebar = ({ isOpen }) => {
  // State
  const [canvases, setCanvases] = useState([]);
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Context and routing
  const { 
    canvasId, 
    setCanvasId, 
    isUserLoggedIn, 
    setUserLoginStatus 
  } = useContext(boardContext);
  const navigate = useNavigate();
  const { id } = useParams();

  // ==================== Helper Functions ====================
  
  /**
   * Get and clean authentication token from localStorage
   * @returns {string|null} Clean token without "Bearer " prefix
   */
  const getToken = () => {
    const token = localStorage.getItem('whiteboard_user_token');
    
    if (!token) {
      return null;
    }
    
    // Remove whitespace
    const trimmed = token.trim();
    
    // Remove "Bearer " prefix if it exists (shouldn't happen, but safety check)
    if (trimmed.startsWith('Bearer ')) {
      return trimmed.substring(7).trim();
    }
    
    return trimmed;
  };

  /**
   * Clear error/success messages after timeout
   */
  const clearMessage = (setter, timeout = 5000) => {
    setTimeout(() => setter(''), timeout);
  };

  // ==================== Canvas Operations ====================
  
  /**
   * Fetch all canvases for the logged-in user
   * Auto-creates a canvas if user has none
   * @returns {Promise<Array>} Array of canvas objects
   */
  const fetchCanvases = async () => {
    try {
      const token = getToken();
      
      if (!token) {
        console.error('No token found');
        return [];
      }
      
      // Fetch canvas list from API
      const response = await axios.get(`${API_BASE_URL}/list`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      const canvasList = response.data;
      setCanvases(canvasList);
      
      // Auto-create canvas if user has none
      if (canvasList.length === 0) {
        const newCanvas = await handleCreateCanvas();
        if (newCanvas) {
          setCanvasId(newCanvas._id);
          handleCanvasClick(newCanvas._id);
        }
      } 
      // Auto-select first canvas if no canvas is currently selected
      else if (!canvasId && canvasList.length > 0 && !id) {
        setCanvasId(canvasList[0]._id);
        handleCanvasClick(canvasList[0]._id);
      }
      
      return canvasList;
    } catch (error) {
      console.error('Error fetching canvases:', error);
      return [];
    }
  };

  /**
   * Create a new canvas
   * @returns {Promise<Object|null>} New canvas object or null on error
   */
  const handleCreateCanvas = async () => {
    try {
      const token = getToken();
      
      if (!token) {
        setError('Please login first');
        clearMessage(setError, 3000);
        return null;
      }
      
      // Create canvas via API
      const response = await axios.post(
        `${API_BASE_URL}/create`, 
        {}, 
        {
          headers: { 
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      // Extract canvas ID from response (handle different response formats)
      const newCanvasId = response.data.canvasId || response.data._id || response.data.id;
      
      if (!newCanvasId) {
        console.error('No canvas ID in response:', response.data);
        setError('Failed to create canvas: No ID returned');
        return null;
      }
      
      // Refresh canvas list and navigate to new canvas
      await fetchCanvases();
      setCanvasId(newCanvasId);
      handleCanvasClick(newCanvasId);
      setSuccess('Canvas created successfully!');
      clearMessage(setSuccess, 3000);
      
      return { _id: newCanvasId };
    } catch (error) {
      console.error('Error creating canvas:', error);
      const errorMessage = 
        error.response?.data?.message || 
        error.response?.data?.error || 
        error.message || 
        'Failed to create canvas';
      setError(`Error: ${errorMessage} (Status: ${error.response?.status || 'N/A'})`);
      clearMessage(setError);
      return null;
    }
  };

  /**
   * Delete a canvas
   * @param {string} canvasIdToDelete - ID of canvas to delete
   */
  const handleDeleteCanvas = async (canvasIdToDelete) => {
    try {
      const token = getToken();
      
      if (!token) {
        setError('Please login first');
        return;
      }
      
      // Delete canvas via API
      await axios.delete(`${API_BASE_URL}/delete/${canvasIdToDelete}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      // Refresh canvas list
      const updatedCanvases = await fetchCanvases();
      
      // If we deleted the current canvas, navigate to another one or home
      if (canvasIdToDelete === canvasId) {
        if (updatedCanvases && updatedCanvases.length > 0) {
          // Navigate to first available canvas
          setCanvasId(updatedCanvases[0]._id);
          handleCanvasClick(updatedCanvases[0]._id);
        } else {
          // No canvases left, go to home
          setCanvasId('');
          navigate('/');
        }
      }
    } catch (error) {
      console.error('Error deleting canvas:', error);
      const errorMessage = 
        error.response?.data?.message || 
        error.response?.data?.error || 
        error.message || 
        'Failed to delete canvas';
      setError(errorMessage);
      clearMessage(setError);
    }
  };

  /**
   * Navigate to a specific canvas
   * @param {string} canvasIdToOpen - ID of canvas to open
   */
  const handleCanvasClick = (canvasIdToOpen) => {
    navigate(`/${canvasIdToOpen}`);
  };

  // ==================== Sharing ====================
  
  /**
   * Share canvas with another user via email
   */
  const handleShare = async () => {
    // Validate email input
    if (!email.trim()) {
      setError("Please enter an email.");
      return;
    }

    try {
      // Clear previous messages
      setError("");
      setSuccess("");

      const token = getToken();
      
      if (!token) {
        setError('Please login first');
        return;
      }
      
      // Share canvas via API
      const response = await axios.put(
        `${API_BASE_URL}/share/${canvasId}`,
        { email },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      setSuccess(response.data.message);
      clearMessage(setSuccess);
    } catch (err) {
      const errorMessage = err.response?.data?.error || "Failed to share canvas.";
      setError(errorMessage);
      clearMessage(setError);
    }
  };

  // ==================== Authentication ====================
  
  /**
   * Handle user logout
   */
  const handleLogout = () => {
    localStorage.removeItem('whiteboard_user_token');
    setCanvases([]);
    setUserLoginStatus(false);
    navigate('/');
  };

  /**
   * Navigate to login page
   */
  const handleLogin = () => {
    navigate('/login');
  };

  // ==================== Effects ====================
  
  /**
   * Fetch canvases when user logs in
   */
  useEffect(() => {
    if (isUserLoggedIn) {
      fetchCanvases();
    }
  }, [isUserLoggedIn]);

  // ==================== Render ====================
  
  const sidebarClassName = `sidebar ${isOpen ? 'sidebar-open' : 'sidebar-closed'}`;

  return (
    <div className={sidebarClassName}>
      {/* Create Canvas Button */}
      <button 
        className="create-button" 
        onClick={handleCreateCanvas} 
        disabled={!isUserLoggedIn}
      >
        + Create New Canvas
      </button>
      
      {/* Canvas List */}
      <ul className="canvas-list">
        {canvases.map((canvas, index) => {
          const isSelected = canvas._id === canvasId;
          const canvasName = canvas.title || canvas.name || `Canvas ${index + 1}`;
          
          return (
            <li 
              key={canvas._id} 
              className={`canvas-item ${isSelected ? 'selected' : ''}`}
            >
              <span 
                className="canvas-name" 
                onClick={() => handleCanvasClick(canvas._id)}
              >
                {canvasName}
              </span>
              <button 
                className="delete-button" 
                onClick={() => handleDeleteCanvas(canvas._id)}
              >
                del
              </button>
            </li>
          );
        })}
      </ul>
      
      {/* Share Container */}
      <div className="share-container">
        <input
          type="email"
          placeholder="Enter the email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button 
          className="share-button" 
          onClick={handleShare} 
          disabled={!isUserLoggedIn}
        >
          Share
        </button>
        {error && <p className="error-message">{error}</p>}
        {success && <p className="success-message">{success}</p>}
      </div>
      
      {/* Auth Button */}
      {isUserLoggedIn ? (
        <button className="auth-button logout-button" onClick={handleLogout}>
          Logout
        </button>
      ) : (
        <button className="auth-button login-button" onClick={handleLogin}>
          Login
        </button>
      )}
    </div>
  );
};

export default Sidebar;
