"use client";

import { DragDropContext, Draggable, Droppable, type DraggableProvidedDragHandleProps } from "@hello-pangea/dnd";
import type { ReactNode } from "react";
import { cn } from "@/lib/client/cn";

/** Drag & drop list (mouse, touch and keyboard via @hello-pangea/dnd). */
export function SortableList<T>({
  id,
  items,
  getId,
  onReorder,
  renderItem,
  disabled = false,
  className,
}: {
  id: string;
  items: T[];
  getId: (item: T) => string;
  onReorder: (next: T[]) => void;
  renderItem: (item: T, index: number, handle: DraggableProvidedDragHandleProps | null | undefined, dragging: boolean) => ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <DragDropContext
      onDragEnd={(result) => {
        if (!result.destination || result.destination.index === result.source.index) return;
        const next = [...items];
        const [moved] = next.splice(result.source.index, 1);
        next.splice(result.destination.index, 0, moved);
        onReorder(next);
      }}
    >
      <Droppable droppableId={id}>
        {(provided) => (
          <ul ref={provided.innerRef} {...provided.droppableProps} className={className}>
            {items.map((item, index) => (
              <Draggable key={getId(item)} draggableId={getId(item)} index={index} isDragDisabled={disabled}>
                {(draggable, snapshot) => (
                  <li
                    ref={draggable.innerRef}
                    {...draggable.draggableProps}
                    className={cn(snapshot.isDragging && "z-50 rounded-xl shadow-float ring-1 ring-accent/40")}
                  >
                    {renderItem(item, index, draggable.dragHandleProps, snapshot.isDragging)}
                  </li>
                )}
              </Draggable>
            ))}
            {provided.placeholder}
          </ul>
        )}
      </Droppable>
    </DragDropContext>
  );
}
