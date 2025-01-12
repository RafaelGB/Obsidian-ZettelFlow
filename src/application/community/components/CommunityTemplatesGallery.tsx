import React, { useState, useEffect, useRef } from "react";
import { request } from "obsidian";
import { c } from "architecture";
import { CommunityTemplateOptions } from "config";

/**
 * Response type expected from the server.
 * Adjust this interface according to your actual API response structure.
 */
interface CommunityTemplatesResponse {
  total: number;
  items: CommunityTemplateOptions[];
  page_info: {
    skip: number;
    limit: number;
    has_next: boolean;
    has_previous: boolean;
  };
}

/**
 * Fetches community templates from the local server, applying pagination, search, and filter.
 *
 * @param skip - The current pagination offset.
 * @param limit - The number of items to retrieve per request.
 * @param searchTerm - Current search input text.
 * @param filter - Current filter selection (all, step, action).
 * @returns A promise resolving to a CommunityTemplatesResponse object.
 */
async function fetchCommunityTemplates(
  skip: number,
  limit: number,
  searchTerm: string,
  filter: "all" | "step" | "action"
): Promise<CommunityTemplatesResponse> {
  // Example GET request using Obsidian's request.
  // Adjust query params to match your back-end logic as needed.
  const rawList = await request({
    url: `http://127.0.0.1:8000/filter?skip=${skip}&limit=${limit}&search=${encodeURIComponent(
      searchTerm
    )}&filter=${filter}`,
    method: "GET",
    contentType: "application/json",
  });
  return JSON.parse(rawList) as CommunityTemplatesResponse;
}

/**
 * A React component that renders an infinite-scrolling gallery of community templates.
 */
export function CommunityTemplatesGallery() {
  // ---- State hooks ----
  const [searchTerm, setSearchTerm] = useState("");
  const [filter, setFilter] = useState<"all" | "step" | "action">("all");

  // Holds the entire list of community templates fetched so far.
  const [templates, setTemplates] = useState<CommunityTemplateOptions[]>([]);

  // Pagination control: we use skip to track how many items are already fetched.
  // (This is an alternative to using page numbers.)
  const [skip, setSkip] = useState(0);

  // Fixed limit of items to fetch each time. Adjust as needed.
  const LIMIT = 15;

  // Flags to control the loading process and determine if more items remain.
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(false);

  // A ref to the sentinel element at the bottom of the list for the IntersectionObserver.
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  // ---- Effects ----

  /**
   * Resets pagination (skip = 0) and template list whenever the search or filter changes.
   * This ensures we start from scratch with the new criteria.
   */
  useEffect(() => {
    setTemplates([]);
    setSkip(0);
    setHasMore(true);
  }, [searchTerm, filter]);

  /**
   * Fetches more data whenever `skip` changes (i.e., we scrolled down), or when we just reset
   * due to new search/filter. If `hasMore` is false, we skip the fetch.
   */
  useEffect(() => {
    if (!hasMore) return;

    const getData = async () => {
      setIsLoading(true);

      try {
        const response = await fetchCommunityTemplates(
          skip,
          LIMIT,
          searchTerm,
          filter
        );
        console.log(`has_next: ${response.page_info.has_next}`);
        // If the server indicates there are no more pages, or if we got fewer items than `LIMIT`,
        // we assume we've reached the end.
        if (!response.page_info.has_next || response.items.length < LIMIT) {
          setHasMore(false);
        }

        // Accumulate the newly fetched items
        setTemplates((prev) => [...prev, ...response.items]);
      } catch (error) {
        console.error("Error fetching community templates:", error);
        // In a real app, you might want to show an error message in the UI.
      } finally {
        setIsLoading(false);
      }
    };

    getData();
  }, [skip, searchTerm, filter, hasMore]);

  /**
   * Sets up the IntersectionObserver to watch the sentinel element.
   * When the sentinel is in view and we're not already fetching, increment `skip` by `LIMIT`.
   */
  useEffect(() => {
    if (!hasMore || isLoading) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const firstEntry = entries[0];
        if (firstEntry.isIntersecting) {
          setSkip((prevSkip) => prevSkip + LIMIT);
        }
      },
      { threshold: 0.1 }
    );

    const currentRef = loadMoreRef.current;
    if (currentRef) observer.observe(currentRef);

    // Cleanup to avoid memory leaks.
    return () => {
      if (currentRef) {
        observer.unobserve(currentRef);
      }
    };
  }, [hasMore, isLoading]);

  // ---- Handlers for the UI elements ----

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
  };

  const handleSetFilter = (value: "all" | "step" | "action") => {
    setFilter(value);
  };

  // ---- Render ----

  return (
    <div style={{ padding: "1rem" }}>
      {/* Search + Filter Options */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1rem",
        }}
      >
        {/* Search Input */}
        <input
          type="text"
          placeholder="Search by title, description, or author..."
          value={searchTerm}
          onChange={handleSearchChange}
          style={{ width: "60%", padding: "0.5rem" }}
        />

        {/* Filter Buttons */}
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button
            onClick={() => handleSetFilter("all")}
            style={{
              backgroundColor: filter === "all" ? "#cccccc" : "",
              padding: "0.5rem",
            }}
          >
            All
          </button>
          <button
            onClick={() => handleSetFilter("step")}
            style={{
              backgroundColor: filter === "step" ? "#cccccc" : "",
              padding: "0.5rem",
            }}
          >
            Steps
          </button>
          <button
            onClick={() => handleSetFilter("action")}
            style={{
              backgroundColor: filter === "action" ? "#cccccc" : "",
              padding: "0.5rem",
            }}
          >
            Actions
          </button>
        </div>
      </div>

      {/* Templates List (rendered as cards) */}
      <div className={c("actions-list")}>
        {templates.map((template) => (
          <div key={template.id} className={c("actions-management-add-card")}>
            <h3>{template.title}</h3>
            <p>{template.description}</p>
            <small>
              Author: {template.author} | Type: {template.type} | Downloads:{" "}
              {template.downloads}
            </small>
          </div>
        ))}
      </div>

      {/* Infinite scroll sentinel */}
      {hasMore && !isLoading && (
        <div ref={loadMoreRef} style={{ height: "1px", margin: "1rem 0" }} />
      )}

      {/* Status messages */}
      {isLoading && <p>Loading more templates...</p>}
      {!hasMore && <p>No more results.</p>}
    </div>
  );
}
