import React, { useCallback, useReducer } from "react";
import boardContext from "./board-context";
import { BOARD_ACTIONS, TOOL_ACTION_TYPES, TOOL_ITEMS } from "../constants";
import {
  createElement,
  isPointNearElement,
} from "../utils/element";

const boardReducer = (state, action) => {
  switch (action.type) {
    case BOARD_ACTIONS.CHANGE_TOOL: {
      return {
        ...state,
        activeToolItem: action.payload.tool,
      };
    }
    case BOARD_ACTIONS.CHANGE_ACTION_TYPE:
      return {
        ...state,
        toolActionType: action.payload.actionType,
      };
    case BOARD_ACTIONS.DRAW_DOWN: {
      const { clientX, clientY, stroke, fill, size } = action.payload;
      const newElement = createElement(
        state.elements.length,
        clientX,
        clientY,
        clientX,
        clientY,
        { type: state.activeToolItem, stroke, fill, size }
      );
      const prevElements = state.elements;
      return {
        ...state,
        toolActionType:
          state.activeToolItem === TOOL_ITEMS.TEXT
            ? TOOL_ACTION_TYPES.WRITING
            : TOOL_ACTION_TYPES.DRAWING,
        elements: [...prevElements, newElement],
      };
    }
    case BOARD_ACTIONS.DRAW_MOVE: {
      const { clientX, clientY } = action.payload;
      const newElements = [...state.elements];
      const index = state.elements.length - 1;
      const { type } = newElements[index];
      switch (type) {
        case TOOL_ITEMS.LINE:
        case TOOL_ITEMS.RECTANGLE:
        case TOOL_ITEMS.CIRCLE:
        case TOOL_ITEMS.ARROW:
          const { x1, y1, stroke, fill, size } = newElements[index];
          const newElement = createElement(index, x1, y1, clientX, clientY, {
            type: state.activeToolItem,
            stroke,
            fill,
            size,
          });
          newElements[index] = newElement;
          return {
            ...state,
            elements: newElements,
          };
        case TOOL_ITEMS.BRUSH:
          newElements[index].points = [
            ...newElements[index].points,
            { x: clientX, y: clientY },
          ];
          // newElements[index].path = new Path2D(
          //   getSvgPathFromStroke(getStroke(newElements[index].points))
          // );
          return {
            ...state,
            elements: newElements,
          };
        default:
          throw new Error("Type not recognized");
      }
    }
    case BOARD_ACTIONS.DRAW_UP: {
      // Filter out invalid elements before saving to history
      const validElements = state.elements.filter(el => el && el.type);
      
      // Create a deep copy of elements to avoid reference issues
      // Handle nested structures properly (points arrays, etc.)
      const elementsCopy = validElements.map(el => {
        const copy = { ...el };
        // Deep copy points array if it exists (for brush strokes)
        if (el.points && Array.isArray(el.points)) {
          copy.points = el.points.map(p => ({ ...p }));
        }
        // Note: roughEle and path objects are recreated during rendering, so we don't need to copy them
        return copy;
      });
      
      // Ensure history array exists
      const currentHistory = state.history || [];
      const newHistory = currentHistory.slice(0, state.index + 1);
      newHistory.push(elementsCopy);
      
      return {
        ...state,
        history: newHistory,
        index: state.index + 1,
      };
    }
    case BOARD_ACTIONS.ERASE: {
      const { clientX, clientY } = action.payload;
      // Filter out elements that are erased, and also filter out any invalid elements
      let newElements = state.elements
        .filter((element) => {
          // Only process valid elements
          if (!element || !element.type) return false;
          return !isPointNearElement(element, clientX, clientY);
        });
      
      // Ensure history array exists
      const currentHistory = state.history || [];
      const newHistory = currentHistory.slice(0, state.index + 1);
      newHistory.push(newElements);
      
      return {
        ...state,
        elements: newElements,
        history: newHistory,
        index: state.index + 1,
      };
    }
    case BOARD_ACTIONS.CHANGE_TEXT: {
      const elementIndex = state.elements.length - 1;
      if (elementIndex < 0) {
        console.warn("Cannot change text: no elements");
        return state;
      }
      
      const element = state.elements[elementIndex];
      if (!element || element.type !== TOOL_ITEMS.TEXT) {
        console.warn("Cannot change text: last element is not text");
        return state;
      }
      
      const newElements = [...state.elements];
      newElements[elementIndex] = { ...element, text: action.payload.text };
      
      // Ensure history array exists
      const currentHistory = state.history || [];
      const newHistory = currentHistory.slice(0, state.index + 1);
      newHistory.push(newElements);
      
      return {
        ...state,
        toolActionType: TOOL_ACTION_TYPES.NONE,
        elements: newElements,
        history: newHistory,
        index: state.index + 1,
      };
    }
    case BOARD_ACTIONS.UNDO: {
      // Safety checks: ensure history exists and index is valid
      if (!state.history || state.history.length === 0) {
        console.warn("Cannot undo: history is empty");
        return state;
      }
      if (state.index <= 0) {
        // Already at first state, nothing to undo
        return state;
      }
      
      const previousIndex = state.index - 1;
      const previousElements = state.history[previousIndex];
      
      // Ensure previous state exists and is valid
      if (!previousElements || !Array.isArray(previousElements)) {
        console.warn("Cannot undo: invalid history state at index", previousIndex, "History:", state.history);
        // Try to recover by going to index 0
        if (state.history[0] && Array.isArray(state.history[0])) {
          return {
            ...state,
            elements: state.history[0],
            index: 0,
          };
        }
        return state;
      }
      
      // Deep copy and filter out invalid elements
      const elementsCopy = previousElements
        .filter(el => el && el.type) // Only keep elements with valid type
        .map(el => {
          const copy = { ...el };
          if (el.points && Array.isArray(el.points)) {
            copy.points = el.points.map(p => ({ ...p }));
          }
          return copy;
        });
      
      return {
        ...state,
        elements: elementsCopy,
        index: previousIndex,
      };
    }
    case BOARD_ACTIONS.REDO: {
      // Safety checks: ensure history exists and index is valid
      if (!state.history || state.history.length === 0) {
        console.warn("Cannot redo: history is empty");
        return state;
      }
      if (state.index >= state.history.length - 1) {
        // Already at latest state, nothing to redo
        return state;
      }
      
      const nextIndex = state.index + 1;
      const nextElements = state.history[nextIndex];
      
      // Ensure next state exists and is valid
      if (!nextElements || !Array.isArray(nextElements)) {
        console.warn("Cannot redo: invalid history state at index", nextIndex, "History:", state.history);
        // Try to recover by going to last valid state
        const lastIndex = state.history.length - 1;
        if (state.history[lastIndex] && Array.isArray(state.history[lastIndex])) {
          const elementsCopy = JSON.parse(JSON.stringify(state.history[lastIndex]));
          return {
            ...state,
            elements: elementsCopy,
            index: lastIndex,
          };
        }
        return state;
      }
      
      // Deep copy and filter out invalid elements
      const elementsCopy = nextElements
        .filter(el => el && el.type) // Only keep elements with valid type
        .map(el => {
          const copy = { ...el };
          if (el.points && Array.isArray(el.points)) {
            copy.points = el.points.map(p => ({ ...p }));
          }
          return copy;
        });
      
      return {
        ...state,
        elements: elementsCopy,
        index: nextIndex,
      };
    }
    case BOARD_ACTIONS.SET_INITIAL_ELEMENTS: {
      const initialElements = action.payload.elements || [];
      return {
        ...state,
        elements: initialElements,
        history: [initialElements],
        index: 0, // Reset index when setting initial elements
      };
    }
    case BOARD_ACTIONS.SET_CANVAS_ID:
      return {
        ...state,
        canvasId: action.payload.canvasId,
      };
    case BOARD_ACTIONS.SET_CANVAS_ELEMENTS:
      return {
        ...state,
        elements: action.payload.elements,
      };

    case BOARD_ACTIONS.SET_HISTORY: {
      const elements = action.payload.elements || [];
      return {
        ...state,
        history: [elements],
        index: 0, // Reset index when setting history
      };
    }

    case BOARD_ACTIONS.SET_USER_LOGIN_STATUS:
      return {
        ...state,
        isUserLoggedIn: action.payload.isUserLoggedIn,
      };
        default:
      return state;
  }
};

const isUserLoggedIn = !!localStorage.getItem("whiteboard_user_token");

const initialBoardState = {
  activeToolItem: TOOL_ITEMS.BRUSH,
  toolActionType: TOOL_ACTION_TYPES.NONE,
  elements: [],
  history: [[]],
  index: 0,
  canvasId: "",
  isUserLoggedIn: isUserLoggedIn,
};


const BoardProvider = ({ children }) => {
  const [boardState, dispatchBoardAction] = useReducer(
    boardReducer,
    initialBoardState
  );

  // Fetch elements from the database on component mount
  // useEffect(() => {
  //   // Move the API call to utils/api.js
  //   fetchInitialCanvasElements(boardState.canvasId)
  //     .then((elements) => {
  //       dispatchBoardAction({
  //         type: BOARD_ACTIONS.SET_INITIAL_ELEMENTS,
  //         payload: { elements },
  //       });
  //     })
  //     .catch((error) => {
  //       console.error("Error fetching initial canvas elements:", error);
  //       // Optionally handle the error, e.g., set a default state or display an error message
  //     });
  // }, []); // Empty dependency array ensures this runs only once on mount

  const changeToolHandler = (tool) => {
    dispatchBoardAction({
      type: BOARD_ACTIONS.CHANGE_TOOL,
      payload: {
        tool,
      },
    });
  };

  const boardMouseDownHandler = (event, toolboxState) => {
    if (boardState.toolActionType === TOOL_ACTION_TYPES.WRITING) return;
    
    // Get canvas element and convert mouse coordinates to canvas coordinates
    const canvas = document.getElementById("canvas");
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const clientX = event.clientX - rect.left;
    const clientY = event.clientY - rect.top;
    
    if (boardState.activeToolItem === TOOL_ITEMS.ERASER) {
      // Erase on mouse down as well for better responsiveness
      dispatchBoardAction({
        type: BOARD_ACTIONS.ERASE,
        payload: {
          clientX,
          clientY,
        },
      });
      dispatchBoardAction({
        type: BOARD_ACTIONS.CHANGE_ACTION_TYPE,
        payload: {
          actionType: TOOL_ACTION_TYPES.ERASING,
        },
      });
      return;
    }
    dispatchBoardAction({
      type: BOARD_ACTIONS.DRAW_DOWN,
      payload: {
        clientX, // Already converted to canvas coordinates above
        clientY, // Already converted to canvas coordinates above
        stroke: toolboxState[boardState.activeToolItem]?.stroke,
        fill: toolboxState[boardState.activeToolItem]?.fill,
        size: toolboxState[boardState.activeToolItem]?.size,
      },
    });
  };

  const boardMouseMoveHandler = (event) => {
    if (boardState.toolActionType === TOOL_ACTION_TYPES.WRITING) return;
    
    // Get canvas element and convert mouse coordinates to canvas coordinates
    const canvas = document.getElementById("canvas");
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const clientX = event.clientX - rect.left;
    const clientY = event.clientY - rect.top;
    
    if (boardState.toolActionType === TOOL_ACTION_TYPES.DRAWING) {
      dispatchBoardAction({
        type: BOARD_ACTIONS.DRAW_MOVE,
        payload: {
          clientX,
          clientY,
        },
      });
    } else if (boardState.toolActionType === TOOL_ACTION_TYPES.ERASING) {
      dispatchBoardAction({
        type: BOARD_ACTIONS.ERASE,
        payload: {
          clientX,
          clientY,
        },
      });
    }
  };

  const boardMouseUpHandler = () => {
    if (boardState.toolActionType === TOOL_ACTION_TYPES.WRITING) return;
    if (boardState.toolActionType === TOOL_ACTION_TYPES.DRAWING) {
      dispatchBoardAction({
        type: BOARD_ACTIONS.DRAW_UP,
      });
    }
    dispatchBoardAction({
      type: BOARD_ACTIONS.CHANGE_ACTION_TYPE,
      payload: {
        actionType: TOOL_ACTION_TYPES.NONE,
      },
    });
  };

  const textAreaBlurHandler = (text) => {
    dispatchBoardAction({
      type: BOARD_ACTIONS.CHANGE_TEXT,
      payload: {
        text,
      },
    });
  };

  const boardUndoHandler = useCallback(() => {
    try {
      dispatchBoardAction({
        type: BOARD_ACTIONS.UNDO,
      });
    } catch (error) {
      console.error("Error in undo handler:", error);
    }
  }, []);

  const boardRedoHandler = useCallback(() => {
    try {
      dispatchBoardAction({
        type: BOARD_ACTIONS.REDO,
      });
    } catch (error) {
      console.error("Error in redo handler:", error);
    }
  }, []);

  const setCanvasId = (canvasId) => {
    dispatchBoardAction({
      type: BOARD_ACTIONS.SET_CANVAS_ID,
      payload: {
        canvasId,
      },
    });
  };

  const setElements = (elements) => {
    dispatchBoardAction({
      type: BOARD_ACTIONS.SET_CANVAS_ELEMENTS,
      payload: {
        elements,
      },
    });
  };
    // console.log("hello canvas")
  const setHistory = (elements) => {
    dispatchBoardAction({
      type: BOARD_ACTIONS.SET_HISTORY,
      payload: {
        elements,
      },
    });
  };  

  const setUserLoginStatus = (isUserLoggedIn) => {
    dispatchBoardAction({
      type: BOARD_ACTIONS.SET_USER_LOGIN_STATUS,
      payload: {
        isUserLoggedIn,
      },
    })
  }

  const boardContextValue = {
    activeToolItem: boardState.activeToolItem,
    elements: boardState.elements,
    toolActionType: boardState.toolActionType,
    canvasId: boardState.canvasId,
    isUserLoggedIn: boardState.isUserLoggedIn,
    changeToolHandler,
    boardMouseDownHandler,
    boardMouseMoveHandler,
    boardMouseUpHandler,
    textAreaBlurHandler,
    undo: boardUndoHandler,
    redo: boardRedoHandler,
    setCanvasId, 
    setElements,
    setHistory,
    setUserLoginStatus
  };

  return (
    <boardContext.Provider value={boardContextValue}>
      {children}
    </boardContext.Provider>
  );
};

export default BoardProvider;
