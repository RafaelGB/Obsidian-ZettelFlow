import { c } from "architecture";
import { CommunityTemplateOptions } from "config";
import React, { useState, useEffect, useRef } from "react";
import { request } from "obsidian";
// Interfaz para el objeto de paginación
type CommunityTemplatesResponse = {
  total: number;
  items: CommunityTemplateOptions[];
  pageInfo: {
    skip: number;
    limit: number;
    has_next: boolean;
    has_previous: boolean;
  };
};

// Mock de fetch para simular una API con paginación progresiva
function fetchCommunityTemplates(
  page: number,
  limit: number,
  searchTerm: string,
  filter: "all" | "step" | "action"
): Promise<CommunityTemplatesResponse> {
  return new Promise(async (resolve) => {
    // Call API localhost:8080/list
    const rawList = await request({
      url: `http://127.0.0.1:8000/list`,
      method: "GET",
      contentType: "application/json",
    });

    const data: CommunityTemplatesResponse = JSON.parse(rawList);
    // Simula filtrado por searchTerm en title, description o author
    let filteredData = data.items.filter((item) => {
      const inSearch = [item.title, item.description, item.author]
        .join(" ")
        .toLowerCase()
        .includes(searchTerm.toLowerCase());
      const inFilter = filter === "all" ? true : item.type === filter;
      return inSearch && inFilter;
    });

    // Simula paginación por 'page' y 'limit'
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const pagedData = filteredData.slice(startIndex, endIndex);

    // Devuelve la página simulada
    resolve(data);
  });
}

export function CommunityTemplatesGallery() {
  // Estado para la búsqueda
  const [searchTerm, setSearchTerm] = useState("");
  // Estado para el filtro (all | step | action)
  const [filter, setFilter] = useState<"all" | "step" | "action">("all");
  // Estado para los templates que se van acumulando
  const [templates, setTemplates] = useState<CommunityTemplateOptions[]>([]);
  // Estado para el tracking de la paginación
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(false);

  // Referencia para el IntersectionObserver (sentinela al final de la lista)
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  // Efecto para "resetear" al cambiar searchTerm o filter
  useEffect(() => {
    // Si cambian el buscador o el filtro, reiniciamos todo
    setTemplates([]);
    setCurrentPage(1);
    setHasMore(true);
  }, [searchTerm, filter]);

  // Efecto para cargar datos cuando currentPage o searchTerm/filter cambian
  useEffect(() => {
    if (!hasMore) return;

    const fetchData = async () => {
      setIsLoading(true);
      // Ejemplo: limit 3 items por "página"
      const limit = 15;
      const response = await fetchCommunityTemplates(
        currentPage,
        limit,
        searchTerm,
        filter
      );

      if (response.items.length < limit) {
        // Si recibimos menos de 'limit' significa que ya no hay más páginas
        setHasMore(false);
      }

      // Agregamos los nuevos items al array existente
      setTemplates((prev) => [...prev, ...response.items]);
      setIsLoading(false);
    };

    fetchData();
  }, [currentPage, searchTerm, filter, hasMore]);

  // Efecto para configurar el IntersectionObserver
  useEffect(() => {
    // Si ya se terminó la data o si ya estamos cargando, no hace falta observar
    if (!hasMore || isLoading) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        // Si el "sentinela" es visible, cargamos la siguiente página
        if (first.isIntersecting) {
          setCurrentPage((prevPage) => prevPage + 1);
        }
      },
      { threshold: 0.1 }
    );

    const currentRef = loadMoreRef.current;
    if (currentRef) {
      observer.observe(currentRef);
    }

    // Cleanup: desconectar el observer para evitar fugas de memoria
    return () => {
      if (currentRef) {
        observer.unobserve(currentRef);
      }
    };
  }, [isLoading, hasMore]);

  // Manejadores para la UI
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
  };

  const handleSetFilter = (value: "all" | "step" | "action") => {
    setFilter(value);
  };

  return (
    <div style={{ padding: "1rem" }}>
      {/* Buscador + Filtros */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1rem",
        }}
      >
        {/* Buscador */}
        <input
          type="text"
          placeholder="Buscar..."
          value={searchTerm}
          onChange={handleSearchChange}
          style={{ width: "60%", padding: "0.5rem" }}
        />

        {/* Filtros a la derecha */}
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button
            onClick={() => handleSetFilter("all")}
            style={{
              backgroundColor: filter === "all" ? "#bbb" : "",
            }}
          >
            All
          </button>
          <button
            onClick={() => handleSetFilter("step")}
            style={{
              backgroundColor: filter === "step" ? "#bbb" : "",
            }}
          >
            Steps
          </button>
          <button
            onClick={() => handleSetFilter("action")}
            style={{
              backgroundColor: filter === "action" ? "#bbb" : "",
            }}
          >
            Actions
          </button>
        </div>
      </div>

      {/* Render de la lista en forma de “cards” */}
      <div className={c("actions-list")}>
        {templates.map((template) => (
          <div key={template.id} className={c("actions-management-add-card")}>
            <h3>{template.title}</h3>
            <p>{template.description}</p>
            <small>
              Autor: {template.author} | Tipo: {template.type} | Descargas:
              {template.downloads}
            </small>
          </div>
        ))}
      </div>

      {/* Sentinela para infinite scroll */}
      {hasMore && !isLoading && (
        <div ref={loadMoreRef} style={{ height: "1px", margin: "1rem 0" }} />
      )}

      {/* Mensajes de estado */}
      {isLoading && <p>Cargando más plantillas...</p>}
      {!hasMore && <p>No hay más resultados</p>}
    </div>
  );
}
