import { useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import rough from "roughjs";
import getStroke from "perfect-freehand";
import axios from "axios";
import { getArrowHeadsCoordinates } from "../../utils/math";

// Context imports
import boardContext from "../../store/board-context";
import toolboxContext from "../../store/toolbox-context";

// Constants and utilities
import { TOOL_ACTION_TYPES, TOOL_ITEMS, ARROW_LENGTH } from "../../constants";
import { getSvgPathFromStroke } from "../../utils/element";
import getSocket from "../../utils/socket";

// Styles
import classes from "./index.module.css";

/**
 * Board Component - Main canvas for drawing and collaboration
 * Handles drawing, real-time updates, and canvas rendering
 */
function Board({ id }) {
  // Refs for canvas and text input
  const canvasRef = useRef();
  const textAreaRef = useRef();

  // Get board state and handlers from context
  const {
    elements,
    toolActionType,
    boardMouseDownHandler,
    boardMouseMoveHandler,
    boardMouseUpHandler,
    textAreaBlurHandler,
    undo,
    redo,
    setCanvasId,
    setElements,
    setHistory,
  } = useContext(boardContext);
  
  const { toolboxState } = useContext(toolboxContext);

  // Local state
  const [isAuthorized, setIsAuthorized] = useState(true);

  // Ref to hold current canvas id and elements (used to save before switching)
  const currentCanvasRef = useRef({ id: null, elements: [] });

  // ==================== Socket Connection & Real-time Updates ====================
  // This effect runs first so we can read the previous canvas from ref before ref is updated
  
  /**
   * Set up socket connection and listen for real-time updates
   * Saves previous canvas before switching so changes aren't lost
   */
  useEffect(() => {
    if (!id) {
      setElements([]);
      setHistory([[]]);
      return;
    }

    const socket = getSocket();
    const prev = currentCanvasRef.current;

    // Save previous canvas before switching (ref still has old id/elements from previous render)
    if (prev.id && prev.id !== id && Array.isArray(prev.elements)) {
      socket.emit("drawingUpdate", { canvasId: prev.id, elements: prev.elements });
    }

    // Update ref to new canvas (so next switch will save this one)
    currentCanvasRef.current = { id, elements: [] };

    // Clear old elements when switching to prevent showing strokes from previous canvas
    setElements([]);
    setHistory([[]]);
    setIsAuthorized(true); // Reset authorization when switching canvases
    
    // Function to join the canvas room
    // Add delay to ensure:
    // 1. Backend has fully saved the canvas (for new canvases)
    // 2. Socket has the authentication token (after login)
    const joinCanvasRoom = () => {
      // Delay helps with:
      // - Newly created canvases (backend saving owner)
      // - After login (socket getting fresh token)
      setTimeout(() => {
        socket.emit("joinCanvas", { canvasId: id });
      }, 300);
    };

    // Listen for drawing updates from other users
    socket.on("receiveDrawingUpdate", (updatedElements) => {
      if (updatedElements && Array.isArray(updatedElements)) {
        // Filter out invalid elements (those without type property)
        const validElements = updatedElements.filter(el => el && el.type);
        setElements(validElements);
      }
    });

    // Listen for initial canvas data from server
    socket.on("loadCanvas", (initialElements) => {
      if (initialElements && Array.isArray(initialElements)) {
        // Filter out invalid elements (those without type property)
        const validElements = initialElements.filter(el => el && el.type);
        setElements(validElements);
        setHistory([validElements]);
      }
    });

    // Handle unauthorized access
    // For newly created canvases, this might be a timing issue, so we retry once
    let unauthorizedRetryCount = 0;
    const handleUnauthorized = (data) => {
      console.log("Unauthorized access:", data.message);
      
      // Retry once for newly created canvases (might be timing issue)
      if (unauthorizedRetryCount === 0) {
        unauthorizedRetryCount++;
        setTimeout(() => {
          socket.emit("joinCanvas", { canvasId: id });
        }, 500);
      } else {
        // If retry also fails, show error
        alert("Access Denied: You cannot edit this canvas.");
        setIsAuthorized(false);
      }
    };

    socket.on("unauthorized", handleUnauthorized);

    // Join canvas when socket is connected
    if (socket.connected) {
      joinCanvasRoom();
    } else {
      socket.on("connect", () => {
        joinCanvasRoom();
      });
    }

    // Cleanup: Remove all event listeners when component unmounts or id changes
    return () => {
      socket.off("receiveDrawingUpdate");
      socket.off("loadCanvas");
      socket.off("unauthorized");
      socket.off("connect");
    };
  }, [id]);

  // Keep ref in sync with current canvas and elements (so we can save correct state when switching)
  useEffect(() => {
    if (id != null) {
      currentCanvasRef.current = { id, elements };
    }
  }, [id, elements]);

  // ==================== Load Canvas Data from API ====================
  
  /**
   * Fetch canvas data from the API when canvas ID changes
   * Clears canvas first to prevent showing old strokes
   */
  useEffect(() => {
    const loadCanvasFromAPI = async () => {
      if (!id) {
        // Clear canvas when no ID
        setElements([]);
        setHistory([[]]);
        return;
      }

      // Clear canvas immediately when switching to prevent showing old strokes
      setElements([]);
      setHistory([[]]);
      
      // Get and clean authentication token
      let token = localStorage.getItem("whiteboard_user_token");
      if (token) {
        token = token.trim();
        // Remove "Bearer " prefix if it exists
        if (token.startsWith('Bearer ')) {
          token = token.substring(7).trim();
        }
      }
      
      if (!token) {
        console.error("No token found");
        return;
      }
      
      try {
        // Fetch canvas data from API
        const response = await axios.get(
          `https://boardapp-backend.onrender.com/api/canvas/load/${id}`,
          {
            headers: { 
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
          }
        );
        
        // Update canvas state with fetched data
        // Filter out invalid elements (those without type property)
        const canvasElements = (response.data.elements || []).filter(
          el => el && el.type
        );
        setCanvasId(id);
        setElements(canvasElements);
        setHistory([canvasElements]);
      } catch (error) {
        console.error("Error loading canvas:", error);
      }
    };

    loadCanvasFromAPI();
  }, [id]);

  // ==================== Canvas Setup ====================
  
  /**
   * Initialize canvas size to match window dimensions
   */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
  }, []);

  // ==================== Keyboard Shortcuts ====================
  
  /**
   * Handle keyboard shortcuts for undo (Ctrl+Z) and redo (Ctrl+Y)
   */
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.ctrlKey && event.key === "z") {
        event.preventDefault();
        undo();
      } else if (event.ctrlKey && event.key === "y") {
        event.preventDefault();
        redo();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [undo, redo]);

  // ==================== Render Drawing Elements ====================
  
  /**
   * Render all drawing elements on the canvas
   * Uses roughjs for shapes and perfect-freehand for brush strokes
   */
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext("2d");
    const roughCanvas = rough.canvas(canvas);
    
    // Clear canvas and fill with white background
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.save();

    // Draw each element based on its type
    // Filter out invalid elements before rendering
    const validElements = elements.filter(el => el && el.type);
    
    validElements.forEach((element) => {
      // Skip elements without type or roughEle (for shapes)
      if (!element.type) {
        console.warn("Skipping element without type:", element);
        return;
      }
      
      switch (element.type) {
        // Draw shapes using roughjs (line, rectangle, circle, arrow)
        case TOOL_ITEMS.LINE:
        case TOOL_ITEMS.RECTANGLE:
        case TOOL_ITEMS.CIRCLE:
        case TOOL_ITEMS.ARROW:
          // Only draw if roughEle exists (it's recreated during rendering if missing)
          if (element.roughEle) {
            roughCanvas.draw(element.roughEle);
          } else {
            // Recreate roughEle if missing (can happen after undo/redo)
            const { x1, y1, x2, y2, stroke, fill, size } = element;
            const options = {
              seed: element.id + 1,
              fillStyle: "solid",
              stroke: stroke || "#000000",
              strokeWidth: size || 1,
            };
            if (fill) options.fill = fill;
            
            let roughElement;
            if (element.type === TOOL_ITEMS.LINE) {
              roughElement = rough.generator().line(x1, y1, x2, y2, options);
            } else if (element.type === TOOL_ITEMS.RECTANGLE) {
              roughElement = rough.generator().rectangle(x1, y1, x2 - x1, y2 - y1, options);
            } else if (element.type === TOOL_ITEMS.CIRCLE) {
              const cx = (x1 + x2) / 2;
              const cy = (y1 + y2) / 2;
              roughElement = rough.generator().ellipse(cx, cy, x2 - x1, y2 - y1, options);
            } else if (element.type === TOOL_ITEMS.ARROW) {
              // Recreate arrow with arrow heads
              const { x3, y3, x4, y4 } = getArrowHeadsCoordinates(
                x1, y1, x2, y2, ARROW_LENGTH
              );
              const points = [
                [x1, y1],
                [x2, y2],
                [x3, y3],
                [x2, y2],
                [x4, y4],
              ];
              roughElement = rough.generator().linearPath(points, options);
            }
            if (roughElement) {
              roughCanvas.draw(roughElement);
            }
          }
          break;

        // Draw brush strokes using perfect-freehand
        case TOOL_ITEMS.BRUSH:
          if (element.points && Array.isArray(element.points) && element.points.length > 0) {
            context.fillStyle = element.stroke || "#000000";
            const brushPath = new Path2D(
              getSvgPathFromStroke(getStroke(element.points))
            );
            context.fill(brushPath);
            context.restore();
          }
          break;

        // Draw text elements
        case TOOL_ITEMS.TEXT:
          if (element.text !== undefined && element.x1 !== undefined && element.y1 !== undefined) {
            context.textBaseline = "top";
            context.font = `${element.size || 32}px Caveat`;
            context.fillStyle = element.stroke || "#000000";
            context.fillText(element.text, element.x1, element.y1);
            context.restore();
          }
          break;

        default:
          console.warn(`Unknown element type: ${element.type}`, element);
          // Don't throw error, just skip invalid elements
      }
    });

    // Cleanup: Clear canvas when elements change
    return () => {
      context.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [elements]);

  // ==================== Text Input Focus ====================
  
  /**
   * Focus text input when text tool is active
   */
  useEffect(() => {
    if (toolActionType === TOOL_ACTION_TYPES.WRITING) {
      const textarea = textAreaRef.current;
      if (textarea) {
        setTimeout(() => {
          textarea.focus();
        }, 0);
      }
    }
  }, [toolActionType]);

  // ==================== Mouse Event Handlers ====================
  
  /**
   * Handle mouse down event - start drawing
   */
  const handleMouseDown = (event) => {
    if (!isAuthorized) return;
    boardMouseDownHandler(event, toolboxState);
  };

  /**
   * Handle mouse move event - update drawing and broadcast changes
   */
  const handleMouseMove = (event) => {
    if (!isAuthorized) return;
    boardMouseMoveHandler(event);
    
    // Broadcast drawing update to other users via socket
    const socket = getSocket();
    socket.emit("drawingUpdate", { canvasId: id, elements });
  };

  /**
   * Handle mouse up event - finish drawing and broadcast final state
   */
  const handleMouseUp = () => {
    if (!isAuthorized) return;
    boardMouseUpHandler();
    
    // Broadcast final drawing update to other users via socket
    const socket = getSocket();
    socket.emit("drawingUpdate", { canvasId: id, elements });
  };

  // ==================== Render ====================
  
  // Get the last element for text input positioning
  const lastElement = elements[elements.length - 1];
  const isWriting = toolActionType === TOOL_ACTION_TYPES.WRITING;

  return (
    <>
      {/* Text input overlay - shown when text tool is active */}
      {isWriting && lastElement && (
        <textarea
          type="text"
          ref={textAreaRef}
          className={classes.textElementBox}
          style={{
            top: lastElement.y1,
            left: lastElement.x1,
            fontSize: `${lastElement?.size}px`,
            color: lastElement?.stroke,
          }}
          onBlur={(event) => textAreaBlurHandler(event.target.value)}
        />
      )}
      
      {/* Main drawing canvas */}
      <canvas
        ref={canvasRef}
        id="canvas"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      />
    </>
  );
}

export default Board;
