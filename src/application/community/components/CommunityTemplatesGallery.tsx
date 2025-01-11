import React, { useState, useEffect } from "react";

// Tipos de ejemplo para simular la respuesta de la API
type CommunityTemplate = {
  id: string;
  name: string;
  description: string;
  author: string;
};

// Interfaz para el objeto de paginación
type CommunityTemplatesResponse = {
  items: CommunityTemplate[];
  currentPage: number;
  totalPages: number;
};

function fetchCommunityTemplates(
  page: number,
  search: string
): Promise<CommunityTemplatesResponse> {
  // Este fetch está moqueado para simular la llamada a una API con paginación.
  // En una implementación real, usarías fetch/axios/etc. y construirías la URL
  // con los parámetros `page` y `search`.
  return new Promise((resolve) => {
    setTimeout(() => {
      // Datos moqueados
      const allItems: CommunityTemplate[] = [
        {
          id: "1",
          name: "Plantilla A",
          description: "Descripción A",
          author: "Alice",
        },
        {
          id: "2",
          name: "Plantilla B",
          description: "Descripción B",
          author: "Bob",
        },
        {
          id: "3",
          name: "Plantilla C",
          description: "Descripción C",
          author: "Charlie",
        },
        {
          id: "4",
          name: "Plantilla D",
          description: "Descripción D",
          author: "Diana",
        },
        {
          id: "5",
          name: "Plantilla E",
          description: "Descripción E",
          author: "Edward",
        },
        // ... podrías simular muchas más
      ];

      // Filtra por nombre o autor si 'search' no está vacío
      const filteredItems = allItems.filter(
        (item) =>
          item.name.toLowerCase().includes(search.toLowerCase()) ||
          item.author.toLowerCase().includes(search.toLowerCase())
      );

      // Definimos un tamaño de página fijo
      const pageSize = 3;
      const startIndex = (page - 1) * pageSize;
      const endIndex = startIndex + pageSize;
      const pagedItems = filteredItems.slice(startIndex, endIndex);

      // Construimos la respuesta simulada
      const response: CommunityTemplatesResponse = {
        items: pagedItems,
        currentPage: page,
        totalPages: Math.ceil(filteredItems.length / pageSize),
      };

      resolve(response);
    }, 500);
  });
}

export function CommunityTemplatesGallery() {
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [templates, setTemplates] = useState<CommunityTemplate[]>([]);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    // Cada vez que cambie la página o el searchTerm, se hace un "fetch" simulado
    fetchCommunityTemplates(currentPage, searchTerm).then((data) => {
      setTemplates(data.items);
      setTotalPages(data.totalPages);
    });
  }, [currentPage, searchTerm]);

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Reiniciamos la paginación a la 1ra página al hacer una nueva búsqueda
    setSearchTerm(e.target.value);
    setCurrentPage(1);
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };

  const handlePrevPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  return (
    <div style={{ padding: "1rem" }}>
      {/* Buscador */}
      <input
        type="text"
        placeholder="Buscar por nombre o autor..."
        value={searchTerm}
        onChange={handleSearch}
        style={{ marginBottom: "1rem", width: "100%", padding: "0.5rem" }}
      />

      {/* Galería en Cards */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem" }}>
        {templates.map((template) => (
          <div
            key={template.id}
            style={{
              flex: "0 0 calc(33.333% - 1rem)",
              border: "1px solid #ccc",
              borderRadius: "4px",
              padding: "1rem",
            }}
          >
            <h3>{template.name}</h3>
            <p>{template.description}</p>
            <small>Autor: {template.author}</small>
          </div>
        ))}
      </div>

      {/* Controles de Paginación */}
      <div style={{ marginTop: "1rem" }}>
        <button onClick={handlePrevPage} disabled={currentPage === 1}>
          Anterior
        </button>
        <span style={{ margin: "0 1rem" }}>
          Página {currentPage} de {totalPages}
        </span>
        <button onClick={handleNextPage} disabled={currentPage === totalPages}>
          Siguiente
        </button>
      </div>
    </div>
  );
}
