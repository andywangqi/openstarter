import { createFileRoute, Link } from "@tanstack/react-router";`r`nimport type { ReactNode } from "react";
import { ArrowRight, Check, Leaf, Move, Sparkles, Upload, WandSparkles } from "lucide-react";
import { BRAND_NAME } from "@/lib/branding";

export const Route = createFileRoute("/_marketing/")({ component: LandingPage });

function LandingPage() {
  return <div className="lp-page">
    <section className="lp-hero">
      <div className="lp-hero-copy">
        <div className="lp-eyebrow"><span className="lp-dot" /> Visual landscape planner</div>
        <h1>Design your yard<br/><em>before you build it.</em></h1>
        <p>Upload a photo of your outdoor space, place plants and landscape elements, and see your design before you buy or build.</p>
        <div className="lp-actions"><Link to="/design" className="lp-primary"><Upload size={18}/> Upload your yard photo <ArrowRight size={17}/></Link><Link to="/design" className="lp-secondary">Try a sample yard</Link></div>
        <div className="lp-note"><Check size={15}/> No signup required · Free to try</div>
      </div>
      <div className="lp-hero-visual"><div className="scene-card"><div className="scene-top"><span>My backyard</span><span className="scene-pill">Planned view</span></div><div className="scene-image"><div className="sun"/><div className="hill hill-a"/><div className="hill hill-b"/><div className="fence"/><div className="tree tree-one">🌳</div><div className="tree tree-two">🌿</div><div className="chair">🪑</div><div className="planter">🪴</div><div className="path"/></div><div className="scene-bottom"><span><span className="status-dot"/> 4 elements placed</span><span>Before <b>→</b> Planned</span></div></div><div className="float-tag tag-one"><Move size={14}/> Drag to arrange</div><div className="float-tag tag-two"><Sparkles size={14}/> Your space, your plan</div></div>
    </section>
    <section className="lp-section how"><div className="section-kicker">HOW IT WORKS</div><h2>From blank canvas to a plan<br/>you can actually build.</h2><div className="steps"><Step n="01" icon={<Upload/>} title="Upload your yard" text="Use a photo of your backyard, patio, or garden."/><Step n="02" icon={<Move/>} title="Place & arrange" text="Add plants, seating, paths, and more. Drag to arrange."/><Step n="03" icon={<WandSparkles/>} title="Preview your design" text="See the finished idea before you spend a dollar."/></div></section>
    <section className="lp-section showcase"><div><div className="section-kicker">MADE FOR REAL SPACES</div><h2>Plan the place<br/>you already love.</h2><p>Small yards, big ideas. Visual Landscape Planner keeps the focus on your actual space, so every decision feels practical and personal.</p><Link to="/design" className="text-link">Start designing <ArrowRight size={16}/></Link></div><div className="mini-board"><div className="mini-label">YOUR YARD</div><div className="mini-yard"><span>🌳</span><span>🌿</span><span>🪑</span><span>🪴</span></div><div className="mini-tools"><span>Plants</span><span>Furniture</span><span>Paths</span><span>+ Add</span></div></div></section>
    <section className="lp-section final-cta"><Leaf size={28}/><h2>Make a plan for your next<br/><em>outside project.</em></h2><Link to="/design" className="lp-primary">Upload your yard photo <ArrowRight size={17}/></Link></section>
  </div>
}
function Step({n,icon,title,text}:{n:string;icon:ReactNode;title:string;text:string}){return <div className="step"><div className="step-icon">{icon}</div><div className="step-num">{n}</div><h3>{title}</h3><p>{text}</p></div>}


