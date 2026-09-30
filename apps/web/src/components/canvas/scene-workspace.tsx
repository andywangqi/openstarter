import { useEffect, useRef, useState } from "react";
import { useValue, type Editor, type TLShapeId } from "tldraw";
import { Maximize, RotateCw, Trash2 } from "lucide-react";
import type { createScene } from "./scene-engine";
import {
  deleteModels,
  duplicateModel,
  getModelShape,
  getModelShapes,
  moveModel,
  MODEL_SHAPE_SIZE,
  resizeModel,
  rotateModel,
  setModelRotation,
  toSceneItem,
} from "./scene-store";

export function SceneWorkspace({ editor }: { editor: Editor }) {
  const [sceneMode, setSceneMode] = useState(true);
  return (
    <>
      <button className="scene-mode-toggle" onClick={() => setSceneMode(!sceneMode)}>
        {sceneMode ? "切换到参考图 / 便签画板" : "返回模型场景"}
      </button>
      {sceneMode && <SceneSurface editor={editor} />}
    </>
  );
}
function SceneSurface({ editor }: { editor: Editor }) {
  const host = useRef<HTMLDivElement>(null);
  const engine = useRef<ReturnType<typeof createScene> | null>(null);
  const [status, setStatus] = useState("");
  const models = useValue("scene models", () => getModelShapes(editor), [editor]);
  const selected = useValue("scene selection", () => editor.getOnlySelectedShapeId(), [editor]);
  const selectedModel = selected ? models.find((m) => m.id === selected) : undefined;
  const sync = () => engine.current?.sync(models.map(toSceneItem), selected ?? null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let alive = true;
    const element = host.current;
    if (!element) return;
    void import("./scene-engine")
      .then(({ createScene }) => {
        if (!alive) return;
        engine.current = createScene(element, {
          select: (id) => {
            if (id) editor.select(id as TLShapeId);
            else editor.selectNone();
          },
          dragStart: () => editor.markHistoryStoppingPoint("Move model"),
          move: (id, x, y) => moveModel(editor, id as TLShapeId, x, y),
          rotate: (id, rotation) => setModelRotation(editor, id as TLShapeId, rotation),
          status: (message) => {
            if (alive) setStatus(message);
          },
        });
        setReady(true);
      })
      .catch(() => {
        if (alive) setStatus("无法初始化场景，请确认浏览器支持 WebGL 后刷新。");
      });
    return () => {
      alive = false;
      engine.current?.dispose();
      engine.current = null;
    };
  }, [editor]);
  useEffect(() => {
    sync();
  }, [models, selected, ready]);
  // Delete removes the selected model; Ctrl/Cmd+D duplicates it. Captured on
  // window so they also fire while the pointer focus is on the WebGL canvas.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        event.isComposing ||
        event.defaultPrevented ||
        target?.isContentEditable ||
        (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
      )
        return;
      const { key } = event;
      if (key === "Delete" || key === "Backspace") {
        const ids = editor.getSelectedShapeIds().filter((id) => getModelShape(editor, id));
        if (ids.length === 0) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        deleteModels(editor, ids);
      } else if ((event.ctrlKey || event.metaKey) && !event.altKey && key.toLowerCase() === "d") {
        const id = editor.getOnlySelectedShapeId();
        if (!id || !getModelShape(editor, id)) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        duplicateModel(editor, id);
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [editor]);
  const rotate = () => {
    if (selectedModel) rotateModel(editor, selectedModel.id, Math.PI / 4);
  };
  return (
    <section className="unified-scene" aria-label="统一模型场景">
      <div className="unified-scene-webgl" ref={host} />
      {!models.length && <div className="scene-empty">从左侧选择植物或家具，直接放入场景</div>}
      {status && (
        <button className="scene-status" onClick={() => engine.current?.retry()}>
          {status}
        </button>
      )}
      <div className="scene-tools" role="toolbar" aria-label="Scene controls">
        <span>
          左键点击选中 · 左键拖动移动模型 · 右键拖动模型转向 · 右键拖空白处旋转视角 · 滚轮缩放 ·
          Delete 删除 · Ctrl/Cmd+D 复制
        </span>
        <button onClick={() => engine.current?.fit()} title="查看全部">
          <Maximize size={17} />
        </button>
        <button onClick={() => engine.current?.rotateAll(Math.PI / 4)}>
          <RotateCw size={17} />
          整体视角
        </button>
        <button disabled={!selectedModel} onClick={rotate}>
          旋转物体 45°
        </button>
        <label>
          大小
          <input
            aria-label="Selected model size"
            type="range"
            min="85"
            max="1020"
            value={selectedModel?.props.w ?? MODEL_SHAPE_SIZE}
            disabled={!selectedModel}
            onPointerDown={() => editor.markHistoryStoppingPoint("Resize model")}
            onChange={(e) => {
              if (selectedModel)
                resizeModel(editor, selectedModel.id, Number(e.target.value));
            }}
          />
        </label>
        <button
          disabled={!selectedModel}
          aria-label="Delete selected model"
          title="删除选中模型 (Delete)"
          onClick={() => selectedModel && deleteModels(editor, [selectedModel.id])}
        >
          <Trash2 size={17} />
        </button>
      </div>
    </section>
  );
}
