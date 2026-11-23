import { Suspense } from "react";
import Composer from "./Composer";

export default function ComposePage() {
  return (
    <Suspense fallback={<div className="page"><div className="skeleton" style={{ height: 400 }} /></div>}>
      <Composer />
    </Suspense>
  );
}
