import { Sheet, SheetContent } from '@/components/ui/sheet';
import Sidebar from './Sidebar';

export default function MobileSidebar({ open, onOpenChange }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-64 p-0 bg-sidebar border-sidebar-border">
        <Sidebar onClose={() => onOpenChange(false)} />
      </SheetContent>
    </Sheet>
  );
}