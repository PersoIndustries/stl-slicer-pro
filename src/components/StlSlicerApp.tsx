import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls, TransformControls, STLLoader } from "three-stdlib";
import {
  Upload, Download, RotateCcw, RotateCw, Move, RotateCw as RotateIcon,
  Box, Layers, Wrench, Crosshair, Eye, EyeOff, Scissors, Loader2, Trash2,
  Keyboard, Info, ChevronDown, ChevronUp, Copy, X, AlertTriangle,
  ArrowDownToLine, MousePointer2, Rocket,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { sliceMesh, exportMeshAsSTL, repairGeometry, SliceError, type CutResult } from "@/lib/stl-slicer";
import DeployPanel from "@/components/DeployPanel";

type Snapshot = {
  meshGeo: THREE.BufferGeometry;
  planePos: [number, number, number];
  planeRot: [number, number, number];
};

export default function StlSlicerApp() {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const orbitRef = useRef<any>(null);
  const transformRef = useRef<any>(null);
  const meshRef = useRef<THREE.Mesh | null>(null);
  const planeGroupRef = useRef<THREE.Group | null>(null);
  const previewGroupRef = useRef<THREE.Group | null>(null);
  const cutsGroupRef = useRef<THREE.Group | null>(null);
  const gridHelperRef = useRef<THREE.GridHelper | null>(null);
  // Prevent feedback loop between gizmo drag and numeric inputs.
  const gizmoDrivenRef = useRef(false);

  const [hasModel, setHasModel] = useState(false);
  const [modelName, setModelName] = useState<string>("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [wireframe, setWireframe] = useState(false);
  const [showPlane, setShowPlane] = useState(true);
  const [showOriginal, setShowOriginal] = useState(true);
  const [transformMode, setTransformMode] = useState<"translate" | "rotate">("translate");
  const [keepBoth, setKeepBoth] = useState(true);
  const [pinCount, setPinCount] = useState(0);
  const [pinRadius, setPinRadius] = useState(2);
  const [pinHeight, setPinHeight] = useState(8);
  const [planePos, setPlanePos] = useState<[number, number, number]>([0, 0, 0]);
  const [planeRot, setPlaneRot] = useState<[number, number, number]>([0, 0, 0]);
  const [cutDone, setCutDone] = useState(false);
  const [transformTarget, setTransformTarget] = useState<"plane" | "model">("plane");
  const [errorDetails, setErrorDetails] = useState<null | {
    message: string;
    stage?: string;
    operation?: string;
    stack?: string;
    geometry?: Record<string, unknown>;
    raw?: Record<string, unknown>;
    when: string;
  }>(null);
  const [errorExpanded, setErrorExpanded] = useState(true);
  const [showShortcuts, setShowShortcuts] = useState(false);

  const historyRef = useRef<Snapshot[]>([]);
  const futureRef = useRef<Snapshot[]>([]);

  // --- Initialize Three.js ---
  useEffect(() => {
    const mount = mountRef.current!;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1f2b);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(50, mount.clientWidth / mount.clientHeight, 0.1, 10000);
    camera.position.set(120, 100, 160);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.shadowMap.enabled = true;
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const dir = new THREE.DirectionalLight(0xffffff, 0.9);
    dir.position.set(100, 200, 150);
    scene.add(dir);
    const dir2 = new THREE.DirectionalLight(0x88aaff, 0.3);
    dir2.position.set(-100, -50, -100);
    scene.add(dir2);

    const grid = new THREE.GridHelper(400, 40, 0x3a4660, 0x2a3447);
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.5;
    scene.add(grid);
    gridHelperRef.current = grid;

    const axes = new THREE.AxesHelper(60);
    scene.add(axes);

    const planeGroup = new THREE.Group();
    const planeGeo = new THREE.PlaneGeometry(100, 100, 10, 10);
    const planeMat = new THREE.MeshBasicMaterial({
      color: 0x22d3ee, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false,
    });
    const planeMesh = new THREE.Mesh(planeGeo, planeMat);
    planeMesh.name = "planeVisual";
    planeGroup.add(planeMesh);

    const planeEdges = new THREE.LineSegments(
      new THREE.EdgesGeometry(planeGeo),
      new THREE.LineBasicMaterial({ color: 0x22d3ee })
    );
    planeGroup.add(planeEdges);

    const planeGrid = new THREE.GridHelper(100, 10, 0x22d3ee, 0x155e6b);
    planeGrid.rotation.x = Math.PI / 2;
    (planeGrid.material as THREE.Material).transparent = true;
    (planeGrid.material as THREE.Material).opacity = 0.5;
    planeGroup.add(planeGrid);

    const arrow = new THREE.ArrowHelper(
      new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, 0), 30, 0x22d3ee, 8, 4
    );
    planeGroup.add(arrow);

    scene.add(planeGroup);
    planeGroupRef.current = planeGroup;

    const previewGroup = new THREE.Group();
    scene.add(previewGroup);
    previewGroupRef.current = previewGroup;

    const cutsGroup = new THREE.Group();
    scene.add(cutsGroup);
    cutsGroupRef.current = cutsGroup;

    const orbit = new OrbitControls(camera, renderer.domElement);
    orbit.enableDamping = true;
    orbit.dampingFactor = 0.08;
    orbitRef.current = orbit;

    const transform = new TransformControls(camera, renderer.domElement);
    transform.attach(planeGroup);
    transform.setSize(0.9);
    (transform as any).addEventListener("dragging-changed", (e: any) => {
      orbit.enabled = !e.value;
      gizmoDrivenRef.current = e.value;
    });
    (transform as any).addEventListener("objectChange", () => {
      const obj = (transform as any).object;
      if (!obj || obj !== planeGroup) return;
      gizmoDrivenRef.current = true;
      const p = planeGroup.position;
      const r = planeGroup.rotation;
      setPlanePos([+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)]);
      setPlaneRot([
        +THREE.MathUtils.radToDeg(r.x).toFixed(1),
        +THREE.MathUtils.radToDeg(r.y).toFixed(1),
        +THREE.MathUtils.radToDeg(r.z).toFixed(1),
      ]);
    });
    const helper = (transform as any).getHelper ? (transform as any).getHelper() : transform;
    scene.add(helper);
    transformRef.current = transform;

    let raf = 0;
    const animate = () => {
      raf = requestAnimationFrame(animate);
      orbit.update();
      renderer.render(scene, camera);
    };
    animate();

    const ro = new ResizeObserver(() => {
      const w = mount.clientWidth, h = mount.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    });
    ro.observe(mount);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.dispose();
      mount.removeChild(renderer.domElement);
    };
  }, []);

  // Wireframe
  useEffect(() => {
    const apply = (m: THREE.Object3D) => {
      m.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) {
          const mat = (o as THREE.Mesh).material as THREE.MeshStandardMaterial;
          if (mat && "wireframe" in mat) mat.wireframe = wireframe;
        }
      });
    };
    if (meshRef.current) apply(meshRef.current);
    if (cutsGroupRef.current) apply(cutsGroupRef.current);
  }, [wireframe, cutDone]);

  // Plane visibility + gizmo enable state
  useEffect(() => {
    if (planeGroupRef.current) planeGroupRef.current.visible = showPlane;
    const t = transformRef.current;
    if (t) {
      const targetIsPlane = transformTarget === "plane";
      const enabled = targetIsPlane ? showPlane : true;
      (t as any).enabled = enabled;
      const helper = (t as any).getHelper ? (t as any).getHelper() : t;
      helper.visible = enabled;
    }
  }, [showPlane, transformTarget]);

  useEffect(() => {
    if (meshRef.current) meshRef.current.visible = showOriginal && !cutDone;
  }, [showOriginal, cutDone]);

  useEffect(() => {
    if (transformRef.current) transformRef.current.setMode(transformMode);
  }, [transformMode]);

  // Switch gizmo target between plane and model
  useEffect(() => {
    const t = transformRef.current;
    if (!t) return;
    if (transformTarget === "model" && meshRef.current) {
      t.attach(meshRef.current);
    } else if (planeGroupRef.current) {
      t.attach(planeGroupRef.current);
    }
  }, [transformTarget, hasModel]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.ctrlKey || e.metaKey) {
        if (e.key === "z" || e.key === "Z") { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
        if (e.key === "y" || e.key === "Y") { e.preventDefault(); redo(); return; }
      }
      switch (e.key.toLowerCase()) {
        case "w": setTransformMode("translate"); break;
        case "e": setTransformMode("rotate"); break;
        case "q": setTransformTarget((t) => (t === "plane" ? "model" : "plane")); break;
        case "p": setShowPlane((v) => !v); break;
        case "o": setShowOriginal((v) => !v); break;
        case "enter":
          if (hasModel && !isProcessing) performCut();
          break;
        case "?": setShowShortcuts((v) => !v); break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasModel, isProcessing]);

  // --- File loading ---
  const loadStlFile = useCallback(async (file: File) => {
    setIsProcessing(true);
    setProgress(20);
    try {
      const buf = await file.arrayBuffer();
      setProgress(50);
      const loader = new STLLoader();
      const geo = loader.parse(buf) as THREE.BufferGeometry;
      geo.computeVertexNormals();
      geo.computeBoundingBox();
      geo.center();
      const bb = geo.boundingBox!;
      const size = new THREE.Vector3();
      bb.getSize(size);
      const maxDim = Math.max(size.x, size.y, size.z);
      if (maxDim > 0) {
        const target = 100;
        const s = target / maxDim;
        if (s !== 1) {
          geo.scale(s, s, s);
          geo.computeBoundingBox();
        }
      }

      if (meshRef.current) {
        sceneRef.current!.remove(meshRef.current);
        meshRef.current.geometry.dispose();
      }
      if (cutsGroupRef.current) cutsGroupRef.current.clear();

      const mat = new THREE.MeshStandardMaterial({
        color: 0xc0c8d4, metalness: 0.15, roughness: 0.55, wireframe,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      sceneRef.current!.add(mesh);
      meshRef.current = mesh;
      setHasModel(true);
      setModelName(file.name);
      setCutDone(false);

      const bb2 = new THREE.Box3().setFromObject(mesh);
      const center = bb2.getCenter(new THREE.Vector3());
      const sphere = bb2.getBoundingSphere(new THREE.Sphere());
      const cam = cameraRef.current!;
      cam.position.copy(center).add(new THREE.Vector3(1, 0.8, 1).normalize().multiplyScalar(sphere.radius * 2.5));
      orbitRef.current.target.copy(center);
      orbitRef.current.update();

      const planeGroup = planeGroupRef.current!;
      planeGroup.position.copy(center);
      planeGroup.rotation.set(0, 0, 0);
      const targetSize = sphere.radius * 2.2;
      planeGroup.scale.setScalar(targetSize / 100);
      gizmoDrivenRef.current = true; // avoid writeback
      setPlanePos([+center.x.toFixed(2), +center.y.toFixed(2), +center.z.toFixed(2)]);
      setPlaneRot([0, 0, 0]);

      // Adjust pin defaults to model size
      const baseR = Math.max(0.5, Math.min(size.x, size.y, size.z) * 0.02);
      setPinRadius(+baseR.toFixed(2));
      setPinHeight(+(baseR * 4).toFixed(2));

      setProgress(100);
      toast.success(`Cargado: ${file.name}`);
      historyRef.current = [];
      futureRef.current = [];
    } catch (err) {
      console.error(err);
      toast.error("Error al cargar el STL");
    } finally {
      setIsProcessing(false);
      setTimeout(() => setProgress(0), 400);
    }
  }, [wireframe]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f && f.name.toLowerCase().endsWith(".stl")) loadStlFile(f);
    else toast.error("Por favor suelta un archivo .stl");
  };

  const getPlaneWorld = () => {
    const g = planeGroupRef.current!;
    g.updateMatrixWorld(true);
    const point = g.position.clone();
    const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(g.quaternion).normalize();
    return { point, normal };
  };

  const applyPlaneInputs = (
    pos: [number, number, number], rotDeg: [number, number, number]
  ) => {
    const g = planeGroupRef.current!;
    g.position.set(...pos);
    g.rotation.set(
      THREE.MathUtils.degToRad(rotDeg[0]),
      THREE.MathUtils.degToRad(rotDeg[1]),
      THREE.MathUtils.degToRad(rotDeg[2])
    );
  };

  const setPlanePosSafe = (v: [number, number, number]) => {
    gizmoDrivenRef.current = false;
    setPlanePos(v);
  };
  const setPlaneRotSafe = (v: [number, number, number]) => {
    gizmoDrivenRef.current = false;
    setPlaneRot(v);
  };

  const centerOnModel = () => {
    if (!meshRef.current) return;
    const bb = new THREE.Box3().setFromObject(meshRef.current);
    const c = bb.getCenter(new THREE.Vector3());
    planeGroupRef.current!.position.copy(c);
    gizmoDrivenRef.current = true;
    setPlanePos([+c.x.toFixed(2), +c.y.toFixed(2), +c.z.toFixed(2)]);
  };

  const alignNormal = (axis: "x" | "y" | "z") => {
    const g = planeGroupRef.current!;
    const target = new THREE.Vector3(axis === "x" ? 1 : 0, axis === "y" ? 1 : 0, axis === "z" ? 1 : 0);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), target);
    g.quaternion.copy(q);
    const e = new THREE.Euler().setFromQuaternion(q);
    gizmoDrivenRef.current = true;
    setPlaneRot([
      +THREE.MathUtils.radToDeg(e.x).toFixed(1),
      +THREE.MathUtils.radToDeg(e.y).toFixed(1),
      +THREE.MathUtils.radToDeg(e.z).toFixed(1),
    ]);
  };

  const alignFace = (face: "top" | "bottom" | "front" | "back" | "left" | "right") => {
    if (!meshRef.current) return;
    const bb = new THREE.Box3().setFromObject(meshRef.current);
    const center = bb.getCenter(new THREE.Vector3());
    let normal = new THREE.Vector3();
    const pos = center.clone();
    switch (face) {
      case "top": normal.set(0, 1, 0); pos.y = bb.max.y; break;
      case "bottom": normal.set(0, -1, 0); pos.y = bb.min.y; break;
      case "front": normal.set(0, 0, 1); pos.z = bb.max.z; break;
      case "back": normal.set(0, 0, -1); pos.z = bb.min.z; break;
      case "right": normal.set(1, 0, 0); pos.x = bb.max.x; break;
      case "left": normal.set(-1, 0, 0); pos.x = bb.min.x; break;
    }
    const g = planeGroupRef.current!;
    g.position.copy(pos);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
    g.quaternion.copy(q);
    const e = new THREE.Euler().setFromQuaternion(q);
    gizmoDrivenRef.current = true;
    setPlanePos([+pos.x.toFixed(2), +pos.y.toFixed(2), +pos.z.toFixed(2)]);
    setPlaneRot([
      +THREE.MathUtils.radToDeg(e.x).toFixed(1),
      +THREE.MathUtils.radToDeg(e.y).toFixed(1),
      +THREE.MathUtils.radToDeg(e.z).toFixed(1),
    ]);
  };

  const rotateModel = (axis: "x" | "y" | "z", deg: number) => {
    if (!meshRef.current) return;
    const m = meshRef.current;
    const q = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(axis === "x" ? 1 : 0, axis === "y" ? 1 : 0, axis === "z" ? 1 : 0),
      THREE.MathUtils.degToRad(deg)
    );
    m.quaternion.premultiply(q);
    m.updateMatrixWorld(true);
  };

  const resetModelTransform = () => {
    if (!meshRef.current) return;
    const m = meshRef.current;
    m.position.set(0, 0, 0);
    m.rotation.set(0, 0, 0);
    m.scale.set(1, 1, 1);
    m.updateMatrixWorld(true);
  };

  const centerModel = () => {
    if (!meshRef.current) return;
    const m = meshRef.current;
    const bb = new THREE.Box3().setFromObject(m);
    const c = bb.getCenter(new THREE.Vector3());
    m.position.sub(c);
    m.updateMatrixWorld(true);
  };

  const dropToFloor = () => {
    if (!meshRef.current) return;
    const m = meshRef.current;
    m.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(m);
    m.position.y -= bb.min.y;
    m.updateMatrixWorld(true);
  };

  const pushSnapshot = () => {
    if (!meshRef.current) return;
    historyRef.current.push({
      meshGeo: meshRef.current.geometry.clone(),
      planePos: [...planePos],
      planeRot: [...planeRot],
    });
    if (historyRef.current.length > 20) historyRef.current.shift();
    futureRef.current = [];
  };

  const undo = () => {
    if (!historyRef.current.length || !meshRef.current) return;
    const snap = historyRef.current.pop()!;
    futureRef.current.push({
      meshGeo: meshRef.current.geometry.clone(),
      planePos: [...planePos], planeRot: [...planeRot],
    });
    meshRef.current.geometry.dispose();
    meshRef.current.geometry = snap.meshGeo;
    cutsGroupRef.current?.clear();
    meshRef.current.visible = true;
    setCutDone(false);
    toast("Deshecho");
  };

  const redo = () => {
    if (!futureRef.current.length || !meshRef.current) return;
    const snap = futureRef.current.pop()!;
    historyRef.current.push({
      meshGeo: meshRef.current.geometry.clone(),
      planePos: [...planePos], planeRot: [...planeRot],
    });
    meshRef.current.geometry.dispose();
    meshRef.current.geometry = snap.meshGeo;
    cutsGroupRef.current?.clear();
    meshRef.current.visible = true;
    setCutDone(false);
    toast("Rehecho");
  };

  const performCut = async () => {
    if (!meshRef.current) return;
    setIsProcessing(true);
    setProgress(15);
    setErrorDetails(null);
    pushSnapshot();
    try {
      const { point, normal } = getPlaneWorld();
      await new Promise((r) => setTimeout(r, 30));
      setProgress(40);
      const result: CutResult = sliceMesh(meshRef.current, point, normal, {
        pins: pinCount,
        pinRadius,
        pinHeight,
      });
      setProgress(80);

      cutsGroupRef.current!.clear();
      cutsGroupRef.current!.add(result.partA);
      if (keepBoth) cutsGroupRef.current!.add(result.partB);
      meshRef.current.visible = false;
      setCutDone(true);
      setProgress(100);
      toast.success("Corte completado");
    } catch (err: unknown) {
      console.error(err);
      const e = err as Error & { stage?: string; details?: Record<string, unknown> };
      const isSlice = err instanceof SliceError;
      const meshGeo = meshRef.current?.geometry;
      const pos = meshGeo?.getAttribute("position");
      setErrorDetails({
        when: new Date().toLocaleTimeString(),
        message: e?.message ?? String(err),
        stage: isSlice ? (err as SliceError).stage : "unknown",
        operation: isSlice
          ? String(((err as SliceError).details as { operation?: string })?.operation ?? "")
          : "",
        stack: e?.stack ?? "",
        raw: isSlice ? (err as SliceError).details : undefined,
        geometry: {
          modelAttributes: meshGeo ? Object.keys(meshGeo.attributes) : [],
          modelIndexed: !!meshGeo?.index,
          modelVertices: pos ? pos.count : 0,
          modelTriangles: meshGeo?.index ? meshGeo.index.count / 3 : (pos ? pos.count / 3 : 0),
          modelType: meshGeo?.type ?? "BufferGeometry",
          pinCount,
        },
      });
      setErrorExpanded(true);
      toast.error("Error durante el corte. Revisa el panel de detalles.");
    } finally {
      setIsProcessing(false);
      setTimeout(() => setProgress(0), 400);
    }
  };

  const resetCut = () => {
    cutsGroupRef.current?.clear();
    if (meshRef.current) meshRef.current.visible = true;
    setCutDone(false);
  };

  const downloadPart = (which: "A" | "B") => {
    const grp = cutsGroupRef.current!;
    const meshes = grp.children.filter((c) => (c as THREE.Mesh).isMesh) as THREE.Mesh[];
    const idx = which === "A" ? 0 : 1;
    if (!meshes[idx]) {
      toast.error(`Pieza ${which} no disponible`);
      return;
    }
    exportMeshAsSTL(meshes[idx], `pieza_${which}.stl`);
  };

  const repair = () => {
    if (!meshRef.current) return;
    pushSnapshot();
    meshRef.current.geometry = repairGeometry(meshRef.current.geometry);
    toast.success("Normales recalculadas");
  };

  // Sync numeric inputs -> plane, but only when the change came from inputs
  // (not from the gizmo). Prevents feedback loop / rotation drift.
  useEffect(() => {
    if (gizmoDrivenRef.current) {
      gizmoDrivenRef.current = false;
      return;
    }
    applyPlaneInputs(planePos, planeRot);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planePos[0], planePos[1], planePos[2], planeRot[0], planeRot[1], planeRot[2]]);

  // Derived: current plane normal for status display
  const currentNormal = (() => {
    const g = planeGroupRef.current;
    if (!g) return null;
    const n = new THREE.Vector3(0, 0, 1).applyQuaternion(g.quaternion).normalize();
    return [+n.x.toFixed(2), +n.y.toFixed(2), +n.z.toFixed(2)] as const;
  })();

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex h-screen w-full bg-background text-foreground overflow-hidden">
        {/* Left sidebar */}
        <aside className="w-64 shrink-0 border-r border-sidebar-border bg-sidebar flex flex-col overflow-hidden">
          <div className="p-4 pb-3 space-y-1">
            <div className="flex items-center gap-2">
              <Scissors className="h-5 w-5 text-primary" />
              <h1 className="text-lg font-semibold">STL Slicer</h1>
            </div>
            <p className="text-xs text-muted-foreground">100% en tu navegador.</p>
          </div>

          <div className="px-4 flex-1 overflow-y-auto space-y-4 pb-4">
            {/* 1. Archivo */}
            <section className="space-y-2">
              <SectionTitle>Archivo</SectionTitle>
              <FileUpload onFile={loadStlFile} />
              {modelName && (
                <p className="text-[11px] text-muted-foreground truncate" title={modelName}>
                  <span className="text-foreground/80">Actual:</span> {modelName}
                </p>
              )}
            </section>

            <Separator />

            {/* 2. Gizmo */}
            <section className="space-y-3">
              <SectionTitle>Manipulador 3D</SectionTitle>

              <div className="space-y-1.5">
                <Label className="text-[11px] text-muted-foreground">Objetivo</Label>
                <div className="grid grid-cols-2 gap-1.5">
                  <Button size="sm" variant={transformTarget === "plane" ? "default" : "secondary"} onClick={() => setTransformTarget("plane")} className="h-8">
                    <Layers className="h-3.5 w-3.5 mr-1" /> Plano
                  </Button>
                  <Button size="sm" variant={transformTarget === "model" ? "default" : "secondary"} onClick={() => setTransformTarget("model")} className="h-8" disabled={!hasModel}>
                    <Box className="h-3.5 w-3.5 mr-1" /> Modelo
                  </Button>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-[11px] text-muted-foreground">Modo</Label>
                <div className="grid grid-cols-2 gap-1.5">
                  <Tooltip><TooltipTrigger asChild>
                    <Button size="sm" variant={transformMode === "translate" ? "default" : "secondary"} onClick={() => setTransformMode("translate")} className="h-8">
                      <Move className="h-3.5 w-3.5 mr-1" /> Mover
                    </Button>
                  </TooltipTrigger><TooltipContent>Tecla W</TooltipContent></Tooltip>
                  <Tooltip><TooltipTrigger asChild>
                    <Button size="sm" variant={transformMode === "rotate" ? "default" : "secondary"} onClick={() => setTransformMode("rotate")} className="h-8">
                      <RotateIcon className="h-3.5 w-3.5 mr-1" /> Rotar
                    </Button>
                  </TooltipTrigger><TooltipContent>Tecla E</TooltipContent></Tooltip>
                </div>
              </div>
            </section>

            <Separator />

            {/* 3. Vista */}
            <section className="space-y-2">
              <SectionTitle>Vista</SectionTitle>
              <ToggleRow icon={<Box className="h-4 w-4" />} label="Wireframe" checked={wireframe} onChange={setWireframe} />
              <ToggleRow icon={<Layers className="h-4 w-4" />} label="Plano de corte" checked={showPlane} onChange={setShowPlane} hint="P" />
              <ToggleRow
                icon={showOriginal ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                label="Modelo original" checked={showOriginal} onChange={setShowOriginal} hint="O"
              />
            </section>

            <Separator />

            {/* 4. Historial / utilidades */}
            <section className="space-y-2">
              <SectionTitle>Historial</SectionTitle>
              <div className="grid grid-cols-2 gap-1.5">
                <Button size="sm" variant="secondary" onClick={undo} disabled={!hasModel}>
                  <RotateCcw className="h-3.5 w-3.5 mr-1" /> Deshacer
                </Button>
                <Button size="sm" variant="secondary" onClick={redo} disabled={!hasModel}>
                  <RotateCw className="h-3.5 w-3.5 mr-1" /> Rehacer
                </Button>
              </div>
              <Tooltip><TooltipTrigger asChild>
                <Button size="sm" variant="secondary" onClick={repair} className="w-full" disabled={!hasModel}>
                  <Wrench className="h-3.5 w-3.5 mr-1" /> Recalcular normales
                </Button>
              </TooltipTrigger><TooltipContent>Recalcula las normales de la malla para mejorar el sombreado.</TooltipContent></Tooltip>
            </section>
          </div>

          {/* Sticky action zone */}
          <div className="border-t border-sidebar-border p-4 space-y-2 bg-sidebar">
            <Button
              onClick={performCut}
              disabled={!hasModel || isProcessing}
              className="w-full"
              size="lg"
            >
              {isProcessing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Scissors className="h-4 w-4 mr-2" />}
              Cortar modelo
            </Button>

            {cutDone && (
              <div className="space-y-1.5">
                <Button onClick={() => downloadPart("A")} variant="secondary" className="w-full" size="sm">
                  <Download className="h-3.5 w-3.5 mr-1.5" /> Pieza A (.stl)
                </Button>
                {keepBoth && (
                  <Button onClick={() => downloadPart("B")} variant="secondary" className="w-full" size="sm">
                    <Download className="h-3.5 w-3.5 mr-1.5" /> Pieza B (.stl)
                  </Button>
                )}
                <Button onClick={resetCut} variant="ghost" className="w-full" size="sm">
                  <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Descartar corte
                </Button>
              </div>
            )}

            <button
              className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 pt-1"
              onClick={() => setShowShortcuts((v) => !v)}
            >
              <Keyboard className="h-3 w-3" /> Atajos de teclado
            </button>
          </div>
        </aside>

        {/* Canvas */}
        <main className="flex-1 relative min-w-0">
          <div
            ref={mountRef}
            className="absolute inset-0"
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
          />

          {!hasModel && (
            <div className={`absolute inset-0 flex items-center justify-center pointer-events-none transition-colors ${dragOver ? "bg-primary/10" : ""}`}>
              <div className="text-center pointer-events-auto">
                <div className="mx-auto mb-4 w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
                  <Upload className="h-10 w-10 text-primary" />
                </div>
                <h2 className="text-2xl font-semibold mb-2">Arrastra un STL aquí</h2>
                <p className="text-muted-foreground mb-4">o usa el botón del panel izquierdo.<br/>Todo se procesa en tu navegador.</p>
              </div>
            </div>
          )}

          {progress > 0 && (
            <div className="absolute top-0 left-0 right-0 h-1 bg-secondary z-10">
              <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
            </div>
          )}

          {/* Status bar (bottom) */}
          {hasModel && (
            <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between gap-3 pointer-events-none">
              <div className="text-[11px] text-muted-foreground bg-card/80 backdrop-blur px-3 py-1.5 rounded-md border border-border pointer-events-auto flex items-center gap-3 flex-wrap">
                <span className="flex items-center gap-1"><MousePointer2 className="h-3 w-3" /> Rueda: zoom · Der: pan · Izq: orbitar</span>
                {currentNormal && (
                  <span className="font-mono">
                    Normal: <span className="text-foreground">[{currentNormal.join(", ")}]</span>
                  </span>
                )}
                <span className="capitalize">
                  Gizmo: <span className="text-foreground">{transformTarget === "plane" ? "plano" : "modelo"} · {transformMode === "translate" ? "mover" : "rotar"}</span>
                </span>
              </div>
            </div>
          )}

          {/* Shortcuts panel */}
          {showShortcuts && (
            <div className="absolute top-3 left-3 bg-card/95 backdrop-blur border border-border rounded-lg shadow-xl p-3 text-xs w-64">
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold flex items-center gap-1"><Keyboard className="h-3.5 w-3.5" /> Atajos</span>
                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setShowShortcuts(false)}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
              <ul className="space-y-1 font-mono">
                <li><Kbd>W</Kbd> mover · <Kbd>E</Kbd> rotar</li>
                <li><Kbd>Q</Kbd> alterna plano ↔ modelo</li>
                <li><Kbd>P</Kbd> ocultar/mostrar plano</li>
                <li><Kbd>O</Kbd> ocultar/mostrar original</li>
                <li><Kbd>Enter</Kbd> cortar</li>
                <li><Kbd>Ctrl/⌘</Kbd>+<Kbd>Z</Kbd> deshacer · <Kbd>+Shift</Kbd> rehacer</li>
              </ul>
            </div>
          )}

          {/* Error panel */}
          {errorDetails && (
            <div className="absolute top-3 right-3 max-w-md w-[26rem] bg-card/95 backdrop-blur border border-destructive/60 rounded-lg shadow-xl text-xs z-20">
              <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-destructive/10 rounded-t-lg">
                <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
                <span className="font-semibold text-destructive">Detalles del error</span>
                <span className="text-muted-foreground ml-1">{errorDetails.when}</span>
                <div className="ml-auto flex items-center gap-1">
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setErrorExpanded((v) => !v)}>
                    {errorExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  </Button>
                  <Button
                    size="icon" variant="ghost" className="h-6 w-6" title="Copiar"
                    onClick={() => {
                      navigator.clipboard.writeText(JSON.stringify(errorDetails, null, 2));
                      toast.success("Detalles copiados");
                    }}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setErrorDetails(null)}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              {errorExpanded && (
                <div className="p-3 space-y-2 max-h-[60vh] overflow-y-auto">
                  <div>
                    <div className="text-muted-foreground uppercase tracking-wide text-[10px]">Mensaje</div>
                    <div className="font-mono text-foreground break-words">{errorDetails.message}</div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <div className="text-muted-foreground uppercase tracking-wide text-[10px]">Etapa</div>
                      <div className="font-mono">{errorDetails.stage || "—"}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground uppercase tracking-wide text-[10px]">Operación</div>
                      <div className="font-mono">{errorDetails.operation || "—"}</div>
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground uppercase tracking-wide text-[10px]">Geometría</div>
                    <pre className="font-mono text-[11px] bg-muted/40 rounded p-2 overflow-x-auto">
{JSON.stringify(errorDetails.geometry, null, 2)}
                    </pre>
                  </div>
                  {errorDetails.raw && (
                    <div>
                      <div className="text-muted-foreground uppercase tracking-wide text-[10px]">Contexto CSG</div>
                      <pre className="font-mono text-[11px] bg-muted/40 rounded p-2 overflow-x-auto">
{JSON.stringify(errorDetails.raw, null, 2)}
                      </pre>
                    </div>
                  )}
                  {errorDetails.stack && (
                    <div>
                      <div className="text-muted-foreground uppercase tracking-wide text-[10px]">Stack</div>
                      <pre className="font-mono text-[10px] bg-muted/40 rounded p-2 overflow-x-auto whitespace-pre-wrap">{errorDetails.stack}</pre>
                    </div>
                  )}
                  <p className="text-muted-foreground text-[11px] pt-1">
                    Pistas: si la etapa es <code>slice:partA/B</code>, el plano puede no cruzar el modelo o hay huecos en la malla. Prueba "Recalcular normales" o reposiciona el plano.
                  </p>
                </div>
              )}
            </div>
          )}
        </main>

        {/* Right panel */}
        <aside className="w-80 shrink-0 border-l border-sidebar-border bg-sidebar overflow-y-auto">
          <Tabs defaultValue="plane" className="p-4">
            <TabsList className="w-full">
              <TabsTrigger value="plane" className="flex-1">Plano</TabsTrigger>
              <TabsTrigger value="model" className="flex-1" disabled={!hasModel}>Modelo</TabsTrigger>
              <TabsTrigger value="cut" className="flex-1">Corte</TabsTrigger>
              <TabsTrigger value="deploy" className="flex-1"><Rocket className="h-3.5 w-3.5 mr-1" />Deploy</TabsTrigger>
            </TabsList>

            {/* Plano — merges position/rotation + alignment shortcuts */}
            <TabsContent value="plane" className="space-y-5 mt-4">
              <section className="space-y-2">
                <SectionTitle>Acciones rápidas</SectionTitle>
                <Button onClick={centerOnModel} variant="secondary" className="w-full" size="sm" disabled={!hasModel}>
                  <Crosshair className="h-4 w-4 mr-2" /> Centrar en el modelo
                </Button>
                <div>
                  <Label className="text-[11px] text-muted-foreground">Alinear normal a eje</Label>
                  <div className="grid grid-cols-3 gap-1.5 mt-1.5">
                    <Button size="sm" variant="secondary" onClick={() => alignNormal("x")}>X</Button>
                    <Button size="sm" variant="secondary" onClick={() => alignNormal("y")}>Y</Button>
                    <Button size="sm" variant="secondary" onClick={() => alignNormal("z")}>Z</Button>
                  </div>
                </div>
                <div>
                  <Label className="text-[11px] text-muted-foreground">Alinear a cara del modelo</Label>
                  <div className="grid grid-cols-3 gap-1.5 mt-1.5">
                    <Button size="sm" variant="secondary" onClick={() => alignFace("top")} disabled={!hasModel}>Sup.</Button>
                    <Button size="sm" variant="secondary" onClick={() => alignFace("bottom")} disabled={!hasModel}>Inf.</Button>
                    <Button size="sm" variant="secondary" onClick={() => alignFace("front")} disabled={!hasModel}>Frontal</Button>
                    <Button size="sm" variant="secondary" onClick={() => alignFace("back")} disabled={!hasModel}>Trasera</Button>
                    <Button size="sm" variant="secondary" onClick={() => alignFace("left")} disabled={!hasModel}>Izq.</Button>
                    <Button size="sm" variant="secondary" onClick={() => alignFace("right")} disabled={!hasModel}>Der.</Button>
                  </div>
                </div>
              </section>

              <Separator />

              <section>
                <SectionTitle>Posición</SectionTitle>
                {(["X", "Y", "Z"] as const).map((axis, i) => (
                  <AxisControl
                    key={axis}
                    label={axis}
                    value={planePos[i]}
                    min={-200} max={200} step={0.5}
                    onChange={(v) => {
                      const np = [...planePos] as [number, number, number];
                      np[i] = v; setPlanePosSafe(np);
                    }}
                  />
                ))}
              </section>

              <Separator />

              <section>
                <SectionTitle>Rotación (°)</SectionTitle>
                {(["X", "Y", "Z"] as const).map((axis, i) => (
                  <AxisControl
                    key={axis}
                    label={axis}
                    value={planeRot[i]}
                    min={-180} max={180} step={1}
                    onChange={(v) => {
                      const nr = [...planeRot] as [number, number, number];
                      nr[i] = v; setPlaneRotSafe(nr);
                    }}
                  />
                ))}
              </section>
            </TabsContent>

            {/* Modelo */}
            <TabsContent value="model" className="space-y-4 mt-4">
              <p className="text-xs text-muted-foreground">
                Rota el modelo antes de cortar. También puedes usar el gizmo (<Kbd>Q</Kbd> para alternar a modelo).
              </p>
              <section>
                <SectionTitle>Rotar 90°</SectionTitle>
                <div className="grid grid-cols-3 gap-1.5 mt-1.5">
                  <Button size="sm" variant="secondary" onClick={() => rotateModel("x", 90)}>+X</Button>
                  <Button size="sm" variant="secondary" onClick={() => rotateModel("y", 90)}>+Y</Button>
                  <Button size="sm" variant="secondary" onClick={() => rotateModel("z", 90)}>+Z</Button>
                  <Button size="sm" variant="secondary" onClick={() => rotateModel("x", -90)}>−X</Button>
                  <Button size="sm" variant="secondary" onClick={() => rotateModel("y", -90)}>−Y</Button>
                  <Button size="sm" variant="secondary" onClick={() => rotateModel("z", -90)}>−Z</Button>
                </div>
              </section>
              <section>
                <SectionTitle>Volcar 180°</SectionTitle>
                <div className="grid grid-cols-3 gap-1.5 mt-1.5">
                  <Button size="sm" variant="secondary" onClick={() => rotateModel("x", 180)}>Eje X</Button>
                  <Button size="sm" variant="secondary" onClick={() => rotateModel("y", 180)}>Eje Y</Button>
                  <Button size="sm" variant="secondary" onClick={() => rotateModel("z", 180)}>Eje Z</Button>
                </div>
              </section>
              <Separator />
              <section>
                <SectionTitle>Posicionar</SectionTitle>
                <div className="grid grid-cols-2 gap-1.5 mt-1.5">
                  <Button size="sm" variant="secondary" onClick={centerModel}>
                    <Crosshair className="h-3.5 w-3.5 mr-1" /> Centrar
                  </Button>
                  <Button size="sm" variant="secondary" onClick={dropToFloor}>
                    <ArrowDownToLine className="h-3.5 w-3.5 mr-1" /> Al suelo
                  </Button>
                  <Button size="sm" variant="secondary" onClick={resetModelTransform} className="col-span-2">
                    <RotateCcw className="h-3.5 w-3.5 mr-1" /> Resetear transformación
                  </Button>
                </div>
              </section>
            </TabsContent>

            {/* Corte */}
            <TabsContent value="cut" className="space-y-4 mt-4">
              <section>
                <SectionTitle>Piezas</SectionTitle>
                <div className="flex items-center justify-between mt-1">
                  <div>
                    <Label className="text-sm">Mantener ambas</Label>
                    <p className="text-[11px] text-muted-foreground">Si está apagado, solo pieza A.</p>
                  </div>
                  <Switch checked={keepBoth} onCheckedChange={setKeepBoth} />
                </div>
              </section>

              <Separator />

              <section className="space-y-3">
                <SectionTitle>Pines / dovelas</SectionTitle>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <Label className="text-xs">Cantidad</Label>
                    <span className="text-sm tabular-nums">{pinCount}</span>
                  </div>
                  <Slider min={0} max={8} step={1} value={[pinCount]} onValueChange={([v]) => setPinCount(v)} />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <Label className="text-xs">Radio</Label>
                    <Input
                      type="number" value={pinRadius} step={0.1} min={0.1}
                      onChange={(e) => setPinRadius(Math.max(0.1, parseFloat(e.target.value) || 0.1))}
                      className="h-7 w-20 text-xs"
                    />
                  </div>
                  <Slider min={0.1} max={20} step={0.1} value={[pinRadius]} onValueChange={([v]) => setPinRadius(v)} />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <Label className="text-xs">Altura</Label>
                    <Input
                      type="number" value={pinHeight} step={0.5} min={0.5}
                      onChange={(e) => setPinHeight(Math.max(0.5, parseFloat(e.target.value) || 0.5))}
                      className="h-7 w-20 text-xs"
                    />
                  </div>
                  <Slider min={0.5} max={50} step={0.5} value={[pinHeight]} onValueChange={([v]) => setPinHeight(v)} />
                </div>
                <p className="text-[11px] text-muted-foreground">Los pines se distribuyen en anillo sobre la cara del corte.</p>
              </section>

              <Separator />

              <p className="text-[11px] text-muted-foreground flex gap-1.5">
                <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                El corte usa CSG y cierra la cara automáticamente para que la pieza sea imprimible. Modelos grandes tardan varios segundos.
              </p>
            </TabsContent>

            {/* Deploy */}
            <TabsContent value="deploy">
              <DeployPanel />
            </TabsContent>
          </Tabs>
        </aside>
      </div>
    </TooltipProvider>
  );
}

// -------- Small helpers --------

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <Label className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">{children}</Label>;
}

function ToggleRow({
  icon, label, checked, onChange, hint,
}: {
  icon: React.ReactNode; label: string; checked: boolean;
  onChange: (v: boolean) => void; hint?: string;
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="flex items-center gap-2 min-w-0">{icon}<span className="truncate">{label}</span></span>
      <div className="flex items-center gap-2 shrink-0">
        {hint && <Kbd className="opacity-60">{hint}</Kbd>}
        <Switch checked={checked} onCheckedChange={onChange} />
      </div>
    </div>
  );
}

function AxisControl({
  label, value, min, max, step, onChange,
}: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="mt-2">
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="font-mono w-4">{label}</span>
        <Input
          type="number"
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          className="h-7 w-24 text-xs"
          step={step}
        />
      </div>
      <Slider min={min} max={max} step={step} value={[value]} onValueChange={([v]) => onChange(v)} />
    </div>
  );
}

function Kbd({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd className={`inline-flex items-center rounded border border-border bg-muted px-1 text-[10px] font-mono ${className}`}>
      {children}
    </kbd>
  );
}

function FileUpload({ onFile }: { onFile: (f: File) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        type="file" accept=".stl" ref={inputRef}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
      />
      <Button onClick={() => inputRef.current?.click()} className="w-full" size="sm">
        <Upload className="h-4 w-4 mr-2" /> Subir STL
      </Button>
    </>
  );
}
